from __future__ import annotations

import base64
import time
from dataclasses import asdict
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.engines import (
    crisis_triage_engine,
    emotion_engine,
    indic_semantic_engine,
    llm_engine,
    nlp_engine,
    recommendation_engine,
    semantic_engine,
    speech_engine,
    svi_engine,
    translation_engine,
    voice_engine,
)
from app.engines.explainability_engine import build as build_explanation
from app.mlops import degradation, drift, evaluation, registry, voice_evaluation
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
    # Always "enabled" (no cost/key gate, unlike the LLM pass above) - it
    # simply reports available=False per-request if the model can't load
    # (fastembed missing, or no network to download it - see
    # semantic_engine.py's docstring), which is a runtime/deployment
    # condition, not a registry-time one.
    registry.register_model_version(
        "semantic_understanding",
        semantic_engine.MODEL_NAME,
        {"origin": "embedding_similarity", "categories": semantic_engine.BLENDABLE_CATEGORIES},
    )
    registry.register_model_version(
        "indic_translation",
        translation_engine.MODEL_NAME if settings.enable_indic_translation else "disabled",
        {
            "origin": "translation",
            "enabled": settings.enable_indic_translation,
            "lexicon_covered_languages": sorted(translation_engine.LEXICON_COVERED_LANGUAGES),
        },
    )
    registry.register_model_version(
        "indic_bert_semantic",
        indic_semantic_engine.MODEL_NAME if settings.enable_indic_bert_semantic else "disabled",
        {
            "origin": "embedding_similarity_experimental",
            "enabled": settings.enable_indic_bert_semantic,
            "eligible_languages": sorted(indic_semantic_engine.ELIGIBLE_LANGUAGES),
            "caveat": "not fine-tuned for sentence-similarity - unvalidated signal, see module docstring",
        },
    )
    registry.register_model_version(
        "crisis_triage",
        crisis_triage_engine.MODEL_VERSION,
        {"origin": "rule_based_decision_tree", "signals": ["emotional_distress", "suicidal_ideation", "threat"]},
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
            degradation.log_degradation("stt", f"{settings.stt_provider}_transcription_failed")
    if transcript is None:
        transcript = speech_engine.get_provider("operator_transcript").transcribe(
            audio_bytes=None, provided_transcript=body.narrative, language_hint=body.language_hint,
        )

    # Once real audio has actually been transcribed, every downstream engine
    # analyzes the real spoken words, not the typed narrative - for a
    # voice-only complaint the typed narrative is just the placeholder text
    # (see FileComplaint.jsx's VOICE_ONLY_PLACEHOLDER) and carries no signal
    # of its own. Checked as "not the operator fallback" rather than
    # "== whisper_local" specifically, so a real transcript from ANY ASR
    # provider (whisper_local, indic_conformer, or a future one) counts -
    # the alternative (an == check per provider name) would need editing
    # again every time a new provider is added, which is exactly the kind
    # of parallel-list drift this codebase's other engines deliberately
    # avoid (see e.g. semantic_engine.py pulling reference phrases directly
    # from nlp_engine.LEXICON instead of a hand-duplicated list).
    analysis_text = transcript.transcript if transcript.source != "operator_transcript" and transcript.transcript.strip() else body.narrative

    voice_result = None
    if audio_bytes:
        try:
            word_count = len(analysis_text.split()) if analysis_text else None
            voice_result = voice_engine.analyze(audio_bytes, transcript_word_count=word_count)
        except Exception:  # noqa: BLE001 - degrade gracefully, voice analysis is optional
            voice_result = None
            degradation.log_degradation("voice_dsp", "voice_analysis_failed")

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
    elif llm_result.error not in (None, "no_api_key_configured", "empty_text"):
        # "no_api_key_configured" means the feature is simply off for this
        # deployment - not a failure. "empty_text" means there was nothing
        # to analyze. Anything else (api_error, malformed_response,
        # no_tool_use_in_response) is a real degrade worth counting - only
        # the category prefix is logged (not the full exception text some
        # of these embed), so distinct error messages from the same failure
        # mode don't fragment the count, and no exception detail leaks into
        # a log a wider set of admins can read.
        degradation.log_degradation("llm", llm_result.error.split(":", 1)[0])

    # Free, local, no-API-key alternative/complement to the LLM pass above -
    # see semantic_engine.py's docstring for why both exist (this catches
    # paraphrases via embedding similarity, at zero cost, but is a cruder
    # signal than genuine LLM comprehension). On by default since there's no
    # cost/key gate; degrades to available=False on any failure (fastembed
    # not installed, model not downloaded - needs real internet access, see
    # that file's docstring). Same max()-only blend rule as every other
    # additive signal here.
    semantic_result = semantic_engine.analyze(analysis_text)
    if semantic_result.available:
        for category in semantic_engine.BLENDABLE_CATEGORIES:
            field_name = f"{category}_score"
            current = getattr(nlp_result, field_name)
            setattr(nlp_result, field_name, max(current, semantic_result.scores[category]))
        # A strong semantic match to suicidal-ideation phrasing sets the
        # flag the same "OR, never suppress" way nlp_engine's own structural
        # end-life regex does - a high bar (70/100, well above the 50-point
        # midpoint of SIMILARITY_FLOOR/CEILING) since this drives a boolean
        # safety flag, not a graded score.
        if semantic_result.suicidal_ideation_similarity >= 70.0:
            nlp_result.suicidal_ideation_flag = True
    elif semantic_result.error not in (None, "empty_text", "disabled_by_config"):
        degradation.log_degradation("semantic", semantic_result.error.split(":", 1)[0])

    # Opt-in bridge for languages OUTSIDE the lexicon's 8-language coverage
    # (see translation_engine.py) - translates to English, then re-runs the
    # already-free semantic engine on the translation so a narrative in e.g.
    # Punjabi or Gujarati gets a real shot at a paraphrase match instead of
    # the lexicon finding literally nothing. NOT sent to the LLM engine: that
    # would double a real per-call API cost for a language Claude can often
    # already read natively, for an unproven accuracy gain - a deliberately
    # narrower scope than the semantic-engine re-run. Same max()-only blend
    # rule as every other additive signal in this pipeline.
    translation_result = translation_engine.translate_to_english(analysis_text, body.language_hint)
    if translation_result.available:
        translated_semantic_result = semantic_engine.analyze(translation_result.translated_text)
        if translated_semantic_result.available:
            for category in semantic_engine.BLENDABLE_CATEGORIES:
                field_name = f"{category}_score"
                current = getattr(nlp_result, field_name)
                setattr(nlp_result, field_name, max(current, translated_semantic_result.scores[category]))
            if translated_semantic_result.suicidal_ideation_similarity >= 70.0:
                nlp_result.suicidal_ideation_flag = True
    elif translation_result.error not in (
        None,
        "empty_text",
        "no_language_hint",
        "lexicon_already_covers_language",
        "disabled_by_config",
    ) and not translation_result.error.startswith("unsupported_language:"):
        degradation.log_degradation("translation", translation_result.error.split(":", 1)[0])

    # Opt-in, EXPERIMENTAL native-language semantic matching (see
    # indic_semantic_engine.py's load-bearing caveat: IndicBERT was not
    # fine-tuned for sentence-similarity, so this signal is unproven, not
    # just heavier). Only ever attempted for the 7 non-English lexicon
    # languages - see ELIGIBLE_LANGUAGES. Same max()-only blend rule as
    # every other additive signal in this pipeline.
    indic_semantic_result = indic_semantic_engine.analyze(analysis_text, body.language_hint)
    if indic_semantic_result.available:
        for category in indic_semantic_engine.BLENDABLE_CATEGORIES:
            field_name = f"{category}_score"
            current = getattr(nlp_result, field_name)
            setattr(nlp_result, field_name, max(current, indic_semantic_result.scores[category]))
        if indic_semantic_result.suicidal_ideation_similarity >= 70.0:
            nlp_result.suicidal_ideation_flag = True
    elif indic_semantic_result.error not in (None, "empty_text", "not_eligible_language", "disabled_by_config"):
        degradation.log_degradation("indic_semantic", indic_semantic_result.error.split(":", 1)[0])

    emotion_result = emotion_engine.analyze(nlp_result, voice_result)

    # Crisis Triage overlay - see crisis_triage_engine.py's docstring for why
    # this is a separate, deliberately simple decision tree over exactly
    # these three signals rather than another input into svi_engine.compute()
    # below (which would double-count what its own suicidal-ideation floor
    # and threat weight already do).
    crisis_triage_result = crisis_triage_engine.assess(nlp_result, emotion_result)

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
        sexual_violence_score=nlp_result.sexual_violence_score,
        custodial_abuse_score=nlp_result.custodial_abuse_score,
        bonded_labor=nlp_result.bonded_labor_score,
        land_displacement=nlp_result.land_displacement_score,
        digital_harassment=nlp_result.digital_harassment_score,
        child_marriage_score=nlp_result.child_marriage_score,
        manual_scavenging=nlp_result.manual_scavenging_score,
        public_humiliation_score=nlp_result.public_humiliation_score,
        public_access_denial=nlp_result.public_access_denial_score,
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
            "sexualViolenceScore": nlp_result.sexual_violence_score,
            "custodialAbuseScore": nlp_result.custodial_abuse_score,
            "bondedLaborScore": nlp_result.bonded_labor_score,
            "landDisplacementScore": nlp_result.land_displacement_score,
            "childMarriageScore": nlp_result.child_marriage_score,
            "digitalHarassmentScore": nlp_result.digital_harassment_score,
            "manualScavengingScore": nlp_result.manual_scavenging_score,
            "publicHumiliationScore": nlp_result.public_humiliation_score,
            "publicAccessDenialScore": nlp_result.public_access_denial_score,
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
            "semanticUnderstanding": (
                {
                    "model": semantic_result.model,
                    "scores": semantic_result.scores,
                    "suicidalIdeationSimilarity": semantic_result.suicidal_ideation_similarity,
                    "topMatches": {k: {"phrase": v[0], "similarity": v[1]} for k, v in semantic_result.top_matches.items()},
                }
                if semantic_result.available
                else None
            ),
            "indicTranslation": (
                {
                    "model": translation_result.model,
                    "sourceLanguage": translation_result.source_language,
                    "translatedText": translation_result.translated_text,
                }
                if translation_result.available
                else None
            ),
            "indicBertSemantic": (
                {
                    "model": indic_semantic_result.model,
                    "scores": indic_semantic_result.scores,
                    "suicidalIdeationSimilarity": indic_semantic_result.suicidal_ideation_similarity,
                    "topMatches": {k: {"phrase": v[0], "similarity": v[1]} for k, v in indic_semantic_result.top_matches.items()},
                }
                if indic_semantic_result.available
                else None
            ),
        },
        "emotion": asdict(emotion_result),
        "crisisTriage": {
            "level": crisis_triage_result.level,
            "score": crisis_triage_result.score,
            "emotionalDistressScore": crisis_triage_result.emotional_distress_score,
            "suicidalIdeationFlag": crisis_triage_result.suicidal_ideation_flag,
            "threatScore": crisis_triage_result.threat_score,
            "severeSignals": crisis_triage_result.severe_signals,
            "elevatedSignals": crisis_triage_result.elevated_signals,
            "reasons": crisis_triage_result.reasons,
            "modelVersion": crisis_triage_result.model_version,
        },
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


@app.get("/v1/mlops/degradation", dependencies=[Depends(require_service_key)])
def mlops_degradation() -> dict:
    return degradation.get_degradation_summary()
