"""Emotion AI Engine - derives an emotion distribution from the voice and
NLP engines' real outputs via a documented weighted-combination formula.

This is deliberately not an independent "emotion classifier" model (there is
no such trained/downloadable model available here either); it is an honest,
explainable aggregation layer over the two engines that *do* compute
directly from input signal, which keeps every number traceable to a cause.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.engines.nlp_engine import NlpIndicators
from app.engines.voice_engine import VoiceMetrics


@dataclass
class EmotionDistribution:
    fear: float
    anxiety: float
    distress: float
    sadness: float
    anger: float
    hope: float
    neutral: float
    dominant_emotion: str
    severity_index: float  # 0-100


def analyze(nlp: NlpIndicators, voice: VoiceMetrics | None) -> EmotionDistribution:
    voice_stress = voice.voice_stress_score if voice else nlp.fear_score * 0.6

    raw = {
        "fear": 0.6 * nlp.fear_score + 0.4 * voice_stress,
        "anxiety": 0.5 * nlp.fear_score + 0.3 * voice_stress + 0.2 * nlp.threat_score,
        "distress": 0.4 * nlp.trauma_score + 0.3 * nlp.threat_score + 0.3 * voice_stress,
        "sadness": 0.6 * nlp.hopelessness_score + 0.4 * nlp.isolation_score,
        "anger": 0.5 * nlp.threat_score + 0.5 * (voice.features.tremor_index * 100 if voice else 0),
        "hope": max(0.0, 40 - 0.3 * nlp.trauma_score),
        "neutral": max(0.0, 30 - 0.2 * nlp.trauma_score - 0.2 * voice_stress),
    }
    total = sum(raw.values()) or 1.0
    normalized = {k: round(100 * v / total, 1) for k, v in raw.items()}

    dominant = max(normalized, key=lambda k: normalized[k])
    severity_index = round(min(100.0, 0.5 * nlp.trauma_score + 0.3 * voice_stress + 0.2 * nlp.threat_score), 1)

    return EmotionDistribution(
        fear=normalized["fear"],
        anxiety=normalized["anxiety"],
        distress=normalized["distress"],
        sadness=normalized["sadness"],
        anger=normalized["anger"],
        hope=normalized["hope"],
        neutral=normalized["neutral"],
        dominant_emotion=dominant,
        severity_index=severity_index,
    )
