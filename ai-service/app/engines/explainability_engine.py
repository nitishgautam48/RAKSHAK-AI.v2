"""Explainable AI Engine.

Produces the confidence score, reason codes, feature-contribution breakdown
and decision path for a completed assessment. Because every upstream engine
(voice/NLP/SVI) is itself a documented deterministic formula rather than an
opaque model, the "feature contribution" numbers here are an *exact* linear
decomposition of the SVI score - not a SHAP/LIME approximation of a black
box, which is a meaningfully stronger explainability guarantee than most
production systems can make.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.engines.nlp_engine import NlpIndicators
from app.engines.svi_engine import SVIResult


@dataclass
class Explanation:
    confidence: float
    reason_codes: list[str]
    features: list[dict]
    decision_path: list[str]


REASON_CODE_MAP = {
    "Threat": "RC-THREAT-01",
    "Fear": "RC-FEAR-01",
    "Trauma": "RC-TRAUMA-01",
    "Voice Stress": "RC-VOICE-01",
    "Isolation": "RC-ISOL-01",
    "Hopelessness": "RC-HOPE-01",
    "Anxiety": "RC-ANX-01",
    "Prior Escalations": "RC-ESC-01",
    "Caste Targeting": "RC-CASTE-01",
    "Vulnerability": "RC-VULN-01",
}


def build(svi: SVIResult, nlp: NlpIndicators) -> Explanation:
    top_contributors = [c for c in svi.contributions if c.contribution_pct > 0][:4]
    reason_codes = [REASON_CODE_MAP.get(c.label, f"RC-{c.label.upper()[:5]}") for c in top_contributors]

    features = [
        {
            "label": c.label,
            "rawValue": c.raw_value,
            "weight": c.weight,
            "contributionPct": c.contribution_pct,
            "direction": c.direction,
        }
        for c in svi.contributions
    ]

    decision_path = [
        "Narrative and voice signal ingested",
        f"NLP lexicon scoring: {len(nlp.matched_keywords)} indicator terms matched",
        "Voice/NLP/emotion sub-scores computed",
        f"SVI weighted combination -> {svi.value} ({svi.band})",
        f"Risk band classified as {svi.band}",
    ]
    if nlp.suicidal_ideation_flag:
        decision_path.append("Suicidal ideation language flagged - escalation path triggered")

    return Explanation(
        confidence=svi.confidence,
        reason_codes=reason_codes,
        features=features,
        decision_path=decision_path,
    )
