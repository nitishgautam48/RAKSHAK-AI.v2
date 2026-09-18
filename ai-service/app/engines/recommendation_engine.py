"""Recommendation Engine - rules engine + confidence ranking.

Maps the SVI/NLP/voice outputs to a prioritized intervention list. The
"ranking" step is a deterministic weighted-score sort over the rule matches,
documented inline; there is no black-box ranking model, consistent with the
same honesty constraint as the other engines in this service.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.engines.nlp_engine import NlpIndicators
from app.engines.svi_engine import SVIResult


@dataclass
class Recommendation:
    type: str
    priority: int
    confidence: float
    rationale: str


def build(svi: SVIResult, nlp: NlpIndicators) -> list[Recommendation]:
    candidates: list[Recommendation] = []

    def add(itype: str, base_confidence: float, rationale: str):
        candidates.append(Recommendation(type=itype, priority=0, confidence=round(base_confidence, 1), rationale=rationale))

    # Always-on baseline for any registered complaint.
    add("COUNSELLING", 70 + 0.2 * svi.value, "Trauma and fear indicators warrant structured psychological support.")

    if nlp.threat_score >= 40 or svi.band in ("HIGH", "CRITICAL"):
        add("POLICE_PROTECTION", 60 + 0.35 * nlp.threat_score, f"Threat-language score {nlp.threat_score} indicates active safety risk.")

    if svi.band == "CRITICAL" or nlp.suicidal_ideation_flag:
        add("WITNESS_PROTECTION", 75 + 0.2 * svi.value, "Critical vulnerability band; formal protection warranted pending officer review.")

    if nlp.isolation_score >= 35:
        add("SHELTER_SUPPORT", 50 + 0.4 * nlp.isolation_score, f"Isolation score {nlp.isolation_score} suggests limited local support network.")

    add("LEGAL_AID", 55 + 0.25 * nlp.threat_score, "SC/ST Prevention of Atrocities Act cases are eligible for free legal aid by default.")

    if svi.value >= 45:
        add("COMPENSATION_SUPPORT", 45 + 0.3 * svi.value, "Statutory compensation eligibility likely given assessed severity.")

    if any(k in ("hit", "struck", "beaten", "injured", "wound", "bleeding", "maara") for k in nlp.matched_keywords):
        add("MEDICAL_AID", 80, "Physical harm keywords detected in narrative; medical assessment recommended.")

    if svi.band in ("HIGH", "CRITICAL") or nlp.hopelessness_score >= 40:
        add("REHABILITATION_SUPPORT", 40 + 0.3 * svi.value, "Sustained recovery support indicated by severity and hopelessness signals.")

    candidates.sort(key=lambda c: c.confidence, reverse=True)
    for i, c in enumerate(candidates):
        c.priority = i + 1
    return candidates
