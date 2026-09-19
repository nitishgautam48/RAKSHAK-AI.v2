from __future__ import annotations

import base64
import time
from dataclasses import asdict
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.engines import (
    emotion_engine,
    llm_engine,
    nlp_engine,
    recommendation_engine,
    speech_engine,
    svi_engine,
    voice_engine,
)
from app.engines.explainability_engine import build as build_explanation
from app.mlops import drift, evaluation, registry, voice_evaluation
from app.schemas import AssessRequest, NlpAnalyzeRequest

settings = get_settings()
app = FastAPI(title=settings.app_name, version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # internal service, reachable only via the Node gateway + service key
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def register_model_versions() -> None:
    registry.register_model_version("nlp", "nlp-lexicon-v1.0.0", {"origin": "rule_based", "categories": list(nlp_engine.LEXICON.keys())})
    registry.register_model_version("voice", "voice-dsp-v2.0.0", {"origin": "signal_processing", "method": "librosa_pyin_pitch+praat_jitter_shimmer_hnr"})
    registry.register_model_version("svi", svi_engine.MODEL_VERSION, {"origin": "rule_based", "weights": svi_engine.WEIGHTS})
    registry.register_model_version(
        "llm_understanding",
        settings.narrative_llm_model if settings.anthropic_api_key else "disabled",
        {"origin": "llm", "enabled": bool(settings.anthropic_api_key), "categories": llm_engine.CATEGORIES},
    )


def require_service_key(x_service_key: Annotated[str | None, Header()] = None) -> None:
    if x_service_key != settings.service_key:
        raise HTTPException(status_code=401, detail="invalid or missing X-Service-Key")


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "traumasense-ai-service", "time": time.time()}


@app.post("/v1/nlp-analysis", dependencies=[Depends(require_service_key)])
def nlp_analysis(body: NlpAnalyzeRequest) -> dict:
    result = nlp_engine.analyze(body.text)
    return asdict(result)


@app.post("/v1/assess", dependencies=[Depends(require_service_key)])
def assess(body: AssessRequest) -> dict:
    t0 = time.time()

    audio_bytes: bytes | None = None
    if body.audio_base64:
        try:
            audio_bytes = base64.b64decode(body.audio_base64)
        except Exception:  # noqa: BLE001 - corrupt/invalid base64 must not break the whole assessment
            audio_bytes = None

    # A real ASR pass only makes sense when there's actual audio to
    # transcribe and a real provider is configured. No audio, an
    # unconfigured provider (the "operator_transcript" default), or any
    # transcription failure (missing model weights, corrupt audio) all fall
    # back to whatever text was already typed by the operator or the victim
    # - see speech_engine.py for why that's the safe default rather than
    # pretending to transcribe. This used to unconditionally pass
    # audio_bytes=None here, so audio was never actually transcribed even
    # when a real STT_PROVIDER was configured - a real bug found while
    # wiring in whisper_local.
    transcript = None
    if audio_bytes and settings.stt_provider != "operator_transcript":
        try:
            transcript = speech_engine.get_provider(settings.stt_provider).transcribe(
                audio_bytes=audio_bytes, provided_transcript=body.narrative, language_hint=body.language_hint,
            )
        except Exception:  # noqa: BLE001 - a real ASR failure must degrade, not 500 the whole assessment
            transcript = None
    if transcript is None:
        transcript = speech_engine.get_provider("operator_transcript").transcribe(
            audio_bytes=None, provided_transcript=body.narrative, language_hint=body.language_hint,
        )

    # Once real audio has actually been transcribed, every downstream engine
    # analyzes the real spoken words, not the typed narrative - for a
    # voice-only complaint the typed narrative is just the placeholder text
    # (see FileComplaint.jsx's VOICE_ONLY_PLACEHOLDER) and carries no signal
    # of its own.
    analysis_text = transcript.transcript if transcript.source == "whisper_local" and transcript.transcript.strip() else body.narrative

    voice_result = None
    if audio_bytes:
        try:
            word_count = len(analysis_text.split()) if analysis_text else None
            voice_result = voice_engine.analyze(audio_bytes, transcript_word_count=word_count)
        except Exception:  # noqa: BLE001 - degrade gracefully, voice analysis is optional
            voice_result = None

    nlp_result = nlp_engine.analyze(analysis_text)

    # Optional real-language-understanding pass (see llm_engine.py's honesty
    # notes) - catches narratives that describe something severe without
    # using any lexicon term, which the keyword engine structurally cannot.
    # Disabled unless ANTHROPIC_API_KEY is configured; degrades silently
    # (available=False) on any failure. Blended via max() per category, same
    # "can only raise, never lower" rule as every other additive signal in
    # this pipeline - a wrong or unavailable LLM read can never suppress a
    # real keyword hit.
    llm_result = llm_engine.analyze(analysis_text)
    if llm_result.available:
        for category in llm_engine.CATEGORIES:
            field_name = f"{category}_score"
            current = getattr(nlp_result, field_name)
            setattr(nlp_result, field_name, max(current, llm_result.scores[category]))

    emotion_result = emotion_engine.analyze(nlp_result, voice_result)

    svi_inputs = svi_engine.SVIInputs(
        fear=nlp_result.fear_score,
        trauma=nlp_result.trauma_score,
        hopelessness=nlp_result.hopelessness_score,
        anxiety=emotion_result.anxiety,
        voice_stress=voice_result.voice_stress_score if voice_result else nlp_result.fear_score * 0.5,
        isolation=nlp_result.isolation_score,
        threat=nlp_result.threat_score,
        caste_targeting=nlp_result.caste_targeting_score,
        vulnerability=nlp_result.vulnerability_score,
        prior_escalations=body.prior_escalations,
        suicidal_ideation_flag=nlp_result.suicidal_ideation_flag,
        authority_context_detected=nlp_result.authority_context_detected,
    )
    svi_result = svi_engine.compute(svi_inputs)
    drift.log_score(svi_result.value, svi_result.band)

    # Triage signal, not a severity input: a firsthand account (nlp_result.
    # victim_testimony_detected) of a case that already scored HIGH/CRITICAL
    # should surface for fast human review. This never feeds back into the
    # score itself - see nlp_engine's FIRST_PERSON_MARKERS note.
    requires_priority_review = nlp_result.victim_testimony_detected and svi_result.band in ("HIGH", "CRITICAL")

    recommendations = recommendation_engine.build(svi_result, nlp_result)
    explanation = build_explanation(svi_result, nlp_result)

    latency_ms = int((time.time() - t0) * 1000)

    return {
        "modelVersions": registry.active_versions(),
        "transcript": asdict(transcript),
        # Distinct from both "transcript.source" and "voice" being present:
        # audio can be received and yet neither successfully transcribed by
        # a real ASR provider nor successfully DSP-analyzed (corrupt/
        # unsupported audio, or STT_PROVIDER left at the operator_transcript
        # default) - without this flag, that state is indistinguishable from
        # "no audio was ever submitted" to anything downstream.
        "audioReceived": audio_bytes is not None,
        "voice": (
            {
                "speakingSpeedWpm": voice_result.speaking_speed_wpm,
                "pauseFrequency": voice_result.pause_frequency,
                "confidenceScore": voice_result.confidence_score,
                "voiceStress": voice_result.voice_stress,
                "voiceStressScore": voice_result.voice_stress_score,
                "speechTremor": voice_result.speech_tremor,
                "fearIndicatorCount": voice_result.fear_indicator_count,
                "jitterLocal": voice_result.features.jitter_local,
                "shimmerLocal": voice_result.features.shimmer_local,
                "hnrDb": voice_result.features.hnr_db,
                "pitchContour": voice_result.features.pitch_contour,
                "energyContour": voice_result.features.energy_contour,
            }
            if voice_result
            else None
        ),
        "nlp": {
            "traumaScore": nlp_result.trauma_score,
            "fearScore": nlp_result.fear_score,
            "isolationScore": nlp_result.isolation_score,
            "threatScore": nlp_result.threat_score,
            "hopelessnessScore": nlp_result.hopelessness_score,
            "vulnerabilityScore": nlp_result.vulnerability_score,
            "casteTargetingScore": nlp_result.caste_targeting_score,
            "confidence": nlp_result.confidence,
            "matchedKeywords": nlp_result.matched_keywords,
            "suicidalIdeationFlag": nlp_result.suicidal_ideation_flag,
            "wordCount": nlp_result.word_count,
            "authorityContextDetected": nlp_result.authority_context_detected,
            "victimTestimonyDetected": nlp_result.victim_testimony_detected,
            "nativeReviewRecommended": nlp_result.native_review_recommended,
            "nativeReviewMatchedTerms": nlp_result.native_review_matched_terms,
            "llmUnderstanding": (
                {
                    "model": llm_result.model,
                    "rationale": llm_result.rationale,
                    "scores": llm_result.scores,
                    "injectionSuspected": llm_result.injection_suspected,
                }
                if llm_result.available
                else None
            ),
        },
        "emotion": asdict(emotion_result),
        "svi": {
            "value": svi_result.value,
            "band": svi_result.band,
            "confidence": svi_result.confidence,
            "modelVersion": svi_result.model_version,
            "escalationProbability": svi_result.escalation_probability,
            "contributions": [asdict(c) for c in svi_result.contributions],
            "requiresPriorityReview": requires_priority_review,
        },
        "recommendations": [asdict(r) for r in recommendations],
        "explanation": {
            "confidence": explanation.confidence,
            "reasonCodes": explanation.reason_codes,
            "features": explanation.features,
            "decisionPath": explanation.decision_path,
        },
        "latencyMs": latency_ms,
    }


@app.get("/v1/mlops/registry", dependencies=[Depends(require_service_key)])
def mlops_registry() -> dict:
    return {"models": registry.list_model_versions(), "datasets": registry.list_datasets()}


@app.get("/v1/mlops/eval", dependencies=[Depends(require_service_key)])
def mlops_eval() -> dict:
    return evaluation.run_eval()


@app.get("/v1/mlops/voice-eval", dependencies=[Depends(require_service_key)])
def mlops_voice_eval() -> dict:
    return voice_evaluation.run_voice_eval()


@app.get("/v1/mlops/drift", dependencies=[Depends(require_service_key)])
def mlops_drift() -> dict:
    return drift.check_drift()
