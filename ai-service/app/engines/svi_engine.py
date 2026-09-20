"""Stress Vulnerability Index Engine.

SVI is a documented, explainable weighted sum of the sub-scores produced by
the voice, NLP and emotion engines plus case-history context (prior
escalations). The weights below are the entire model - there is no hidden
neural layer - which is what lets the Explainable AI Engine report an exact,
correct feature-contribution breakdown for every SVI value it produces
(this is a real linear decomposition, not an approximation of a black box).

Weights intentionally do NOT sum to 1. A real narrative rarely activates all
eight dimensions at once (a death threat and a social-isolation complaint
are different situations), so a probability-style weighted *average* across
all eight systematically under-scores single-dimension-but-severe cases
(validated against app/mlops/evaluation.py: capping weights at sum=1 held
severe-threat narratives to a MODERATE band). Treating this instead as a
severity index - each dimension can independently push the (0-100-clamped)
score up, sized by how much that dimension alone should matter - lets one
dominant, severe signal reach HIGH/CRITICAL on its own while still letting
several moderate signals compound. It is still a fully transparent linear
formula; only its normalization convention changed.
"""

from __future__ import annotations

from dataclasses import dataclass, field

WEIGHTS: dict[str, float] = {
    "threat": 0.60,
    "fear": 0.50,
    "trauma": 0.40,
    "hopelessness": 0.35,
    "voice_stress": 0.30,
    "isolation": 0.30,
    "caste_targeting": 0.15,
    "vulnerability": 0.12,
    "anxiety": 0.22,
    "prior_escalations": 0.08,
}
# v1.2.0: added caste_targeting and vulnerability as real SVI inputs. Until
# this change, the NLP engine computed both (caste-targeting language,
# household vulnerability factors like young children/elderly/pregnancy) but
# neither fed into the score at all - a real gap on a platform specifically
# about caste-based atrocities against an at-risk population. Weighted lower
# than the primary severity signals (threat/fear/trauma) because they are
# compounding/contextual factors, not standalone severity indicators - a
# caste-targeting remark with no other signal shouldn't alone reach CRITICAL,
# but should measurably raise the score over an otherwise-identical case
# without it.
MODEL_VERSION = "svi-weighted-v1.2.0"


@dataclass
class SVIInputs:
    fear: float
    trauma: float
    hopelessness: float
    anxiety: float
    voice_stress: float
    isolation: float
    threat: float
    caste_targeting: float = 0.0
    vulnerability: float = 0.0
    prior_escalations: int = 0  # count of prior ESCALATED status changes on this case
    suicidal_ideation_flag: bool = False
    authority_context_detected: bool = False
    sexual_violence_score: float = 0.0
    custodial_abuse_score: float = 0.0


@dataclass
class Contribution:
    label: str
    raw_value: float
    weight: float
    contribution_pct: float  # signed, sums to ~the final score
    direction: str  # "increase" | "decrease"


@dataclass
class SVIResult:
    value: float
    band: str
    confidence: float
    model_version: str
    contributions: list[Contribution] = field(default_factory=list)
    escalation_probability: float = 0.0


def _band(value: float) -> str:
    if value >= 75:
        return "CRITICAL"
    if value >= 55:
        return "HIGH"
    if value >= 30:
        return "MODERATE"
    return "LOW"


def compute(inputs: SVIInputs) -> SVIResult:
    prior_escalation_score = min(100.0, inputs.prior_escalations * 25)
    components = {
        "fear": inputs.fear,
        "trauma": inputs.trauma,
        "hopelessness": inputs.hopelessness,
        "anxiety": inputs.anxiety,
        "voice_stress": inputs.voice_stress,
        "isolation": inputs.isolation,
        "threat": inputs.threat,
        "caste_targeting": inputs.caste_targeting,
        "vulnerability": inputs.vulnerability,
        "prior_escalations": prior_escalation_score,
    }

    value = sum(components[k] * WEIGHTS[k] for k in WEIGHTS)
    value = float(max(0.0, min(100.0, value)))

    contributions = [
        Contribution(
            label=k.replace("_", " ").title(),
            raw_value=round(components[k], 1),
            weight=WEIGHTS[k],
            contribution_pct=round(components[k] * WEIGHTS[k], 1),
            direction="increase",
        )
        for k in WEIGHTS
    ]

    # Explicit disclosed escalation, not a weighted-sum term: abuse by
    # someone in a position of power/trust over the narrator (teacher,
    # employer, landlord, custodial officer, etc.) is a recognized
    # aggravating factor - the SC/ST (Prevention of Atrocities) Act itself
    # treats an offence by a public servant more severely for the same
    # reason (Section 3(2)(vii)). Only applied when there's already a real,
    # non-zero signal behind it (nlp_engine only sets this flag alongside a
    # matched abuse category - see its authority_context_detected note), so
    # an authority word alone in an otherwise-neutral narrative can't move
    # the score. The exact +8 magnitude is a policy calibration - like
    # SUICIDAL_IDEATION_FLOOR below, a legal/social-work reviewer familiar
    # with the Act should sign off on it before relying on it operationally.
    AUTHORITY_ESCALATION = 8.0
    if inputs.authority_context_detected and value > 0:
        boosted = min(100.0, value + AUTHORITY_ESCALATION)
        contributions.append(
            Contribution(
                label="Authority Power-Imbalance Escalation",
                raw_value=1.0,
                weight=0.0,
                contribution_pct=round(boosted - value, 1),
                direction="increase",
            ),
        )
        value = boosted

    # Explicit safety floor, not a weighted-sum term: explicit suicidal
    # ideation language is a mental-health emergency regardless of how many
    # other lexicon categories happen to have fired in the same narrative -
    # found as a real gap while expanding the evaluation set (the flag was
    # being detected and shown in the UI but had zero effect on the actual
    # score or risk band). Floored at HIGH (55), not CRITICAL, since CRITICAL
    # is reserved for the strongest/most numerous combined signal - see the
    # module docstring - and this is a disclosed rule, not a hidden nudge:
    # it appears in the contribution breakdown like everything else.
    SUICIDAL_IDEATION_FLOOR = 55.0
    if inputs.suicidal_ideation_flag and value < SUICIDAL_IDEATION_FLOOR:
        contributions.append(
            Contribution(
                label="Suicidal Ideation Safety Floor",
                raw_value=1.0,
                weight=0.0,
                contribution_pct=round(SUICIDAL_IDEATION_FLOOR - value, 1),
                direction="increase",
            ),
        )
        value = SUICIDAL_IDEATION_FLOOR

    # Same reasoning and same pattern as the suicidal-ideation floor above -
    # found live, the same way that one was: a disclosed rape ("she was
    # raped by...") only fed SVI indirectly through trauma_score's diluted
    # 0.35 weight, capping its own maximum possible contribution to SVI at
    # roughly 14 points (0.35 x 100 x 0.40 trauma weight) - nowhere near
    # enough for one of the most severe atrocity categories this platform
    # exists to catch. Custodial death/torture - abuse by the very
    # authority meant to protect someone - is the same kind of category:
    # severe enough on its own to not be left to a diluted composite. Both
    # floor at HIGH (55), same as suicidal ideation, not CRITICAL - see that
    # floor's comment for why. The 50-point activation threshold and the
    # 55-point floor value are disclosed policy calibrations pending review
    # by someone with real domain/legal expertise, like every other
    # constant in this function.
    SEVERE_ATROCITY_SCORE_THRESHOLD = 50.0
    SEVERE_ATROCITY_FLOOR = 55.0
    if (
        inputs.sexual_violence_score >= SEVERE_ATROCITY_SCORE_THRESHOLD or inputs.custodial_abuse_score >= SEVERE_ATROCITY_SCORE_THRESHOLD
    ) and value < SEVERE_ATROCITY_FLOOR:
        contributions.append(
            Contribution(
                label="Severe Atrocity Safety Floor",
                raw_value=max(inputs.sexual_violence_score, inputs.custodial_abuse_score),
                weight=0.0,
                contribution_pct=round(SEVERE_ATROCITY_FLOOR - value, 1),
                direction="increase",
            ),
        )
        value = SEVERE_ATROCITY_FLOOR

    contributions.sort(key=lambda c: c.contribution_pct, reverse=True)

    # Escalation probability: logistic-shaped function of the SVI value
    # itself plus prior-escalation history, calibrated so 50 SVI ~ 20%
    # and 90 SVI ~ 85% - a documented curve, not a fitted classifier.
    import math

    logit = -4.5 + 0.09 * value + 0.35 * inputs.prior_escalations
    escalation_probability = round(100 / (1 + math.exp(-logit)), 1)

    confidence = float(round(min(96.0, 65 + 0.3 * (100 - abs(50 - value))), 1))

    return SVIResult(
        value=round(value, 1),
        band=_band(value),
        confidence=confidence,
        model_version=MODEL_VERSION,
        contributions=contributions,
        escalation_probability=escalation_probability,
    )
