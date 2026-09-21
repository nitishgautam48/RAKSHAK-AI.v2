"""Crisis Triage Engine - a synthesis layer, not a new model.

Combines the three signals most directly tied to imminent risk to a
person's safety - each already computed correctly by a separate engine for
its own purpose - into one unified triage verdict:
  - emotional distress: emotion_engine.EmotionDistribution.distress
  - suicidal ideation: nlp_engine.NlpIndicators.suicidal_ideation_flag
  - threat (from another party): nlp_engine.NlpIndicators.threat_score

WHY THIS EXISTS: these three numbers already exist, computed correctly, but
scattered across two different response sections (distress sits under
`emotion`, the suicidal flag and threat score sit under `nlp`) with nothing
reading all three together and saying, in one place, "this needs eyes on it
right now, and here is exactly why." A staff member scanning a worklist
otherwise has to mentally correlate three separate fields for every case.

DESIGN - deliberately a simple, disclosed decision tree, NOT a re-run of
svi_engine.py's continuous weighted sum:
  - a single signal reaching its own "severe" threshold alone reaches HIGH,
    mirroring svi_engine.py's own precedent (SUICIDAL_IDEATION_FLOOR,
    SEVERE_ATROCITY_FLOOR both floor at HIGH/55, not CRITICAL - "CRITICAL is
    reserved for the strongest/most numerous combined signal", per that
    module's own docstring). This engine applies that exact same reasoning
    directly and explicitly.
  - two or more of the three signals reaching "severe" together reaches
    CRITICAL - a combination of independent severe signals is treated as
    more urgent than any one of them alone.
  - a signal reaching a lower "elevated" threshold (worth watching, not yet
    severe) reaches ELEVATED if nothing else is already severe.
This engine is intentionally simpler and more literal than the SVI so it
stays trivially auditable at a glance - it is a triage overlay for staff
attention, not a severity score, and does NOT feed back into
svi_engine.compute() as an input (that would double-count signals the SVI
formula and its own suicidal-ideation floor already use).

Every threshold below is a disclosed POLICY CALIBRATION, not derived from
any dataset - the same caveat as every other constant in this codebase
(SUICIDAL_IDEATION_FLOOR, PRIORITY_THRESHOLD, etc.), pending review by
someone with real clinical/legal expertise before this drives real staff
prioritization.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.engines.emotion_engine import EmotionDistribution
from app.engines.nlp_engine import NlpIndicators

MODEL_VERSION = "crisis-triage-v1.0.0"

# Disclosed policy thresholds - see module docstring.
DISTRESS_SEVERE_THRESHOLD = 70.0
DISTRESS_ELEVATED_THRESHOLD = 40.0
THREAT_SEVERE_THRESHOLD = 60.0
THREAT_ELEVATED_THRESHOLD = 30.0

LEVELS = ("NONE", "ELEVATED", "HIGH", "CRITICAL")


@dataclass
class CrisisTriageResult:
    level: str  # one of LEVELS
    score: float  # 0-100: max of the three signals (100 if suicidal ideation) - for sorting/display only, NOT an SVI substitute
    emotional_distress_score: float
    suicidal_ideation_flag: bool
    threat_score: float
    # Which of the three independent signals reached "severe"/"elevated" -
    # a list, not a single "primary driver" string, since CRITICAL is
    # explicitly a multi-signal state and staff should see every
    # contributing signal, not just one.
    severe_signals: list[str] = field(default_factory=list)
    elevated_signals: list[str] = field(default_factory=list)
    reasons: list[str] = field(default_factory=list)
    model_version: str = MODEL_VERSION


def assess(nlp: NlpIndicators, emotion: EmotionDistribution) -> CrisisTriageResult:
    distress = emotion.distress
    threat = nlp.threat_score
    suicidal = nlp.suicidal_ideation_flag

    severe_signals: list[str] = []
    elevated_signals: list[str] = []
    reasons: list[str] = []

    # Suicidal ideation is always treated as its own severe signal - a
    # mental-health emergency regardless of how the other two axes read,
    # mirroring svi_engine.py's SUICIDAL_IDEATION_FLOOR exactly.
    if suicidal:
        severe_signals.append("suicidal_ideation")
        elevated_signals.append("suicidal_ideation")
        reasons.append("Suicidal ideation detected - a mental-health emergency in its own right.")

    if threat >= THREAT_SEVERE_THRESHOLD:
        severe_signals.append("threat")
        elevated_signals.append("threat")
        reasons.append(f"Threat score {threat:.1f}/100 indicates a credible, severe threat from another party.")
    elif threat >= THREAT_ELEVATED_THRESHOLD:
        elevated_signals.append("threat")
        reasons.append(f"Threat score {threat:.1f}/100 shows moderate threat language worth monitoring.")

    if distress >= DISTRESS_SEVERE_THRESHOLD:
        severe_signals.append("emotional_distress")
        elevated_signals.append("emotional_distress")
        reasons.append(f"Emotional distress at {distress:.1f}/100 - high acute distress.")
    elif distress >= DISTRESS_ELEVATED_THRESHOLD:
        elevated_signals.append("emotional_distress")
        reasons.append(f"Emotional distress at {distress:.1f}/100 - elevated but not yet acute.")

    if len(severe_signals) >= 2:
        level = "CRITICAL"
    elif len(severe_signals) == 1:
        level = "HIGH"
    elif elevated_signals:
        level = "ELEVATED"
    else:
        level = "NONE"
        reasons.append("No elevated distress, suicidal-ideation, or threat signal detected.")

    score = round(max(100.0 if suicidal else 0.0, threat, distress), 1)

    return CrisisTriageResult(
        level=level,
        score=score,
        emotional_distress_score=round(distress, 1),
        suicidal_ideation_flag=suicidal,
        threat_score=round(threat, 1),
        severe_signals=severe_signals,
        elevated_signals=elevated_signals,
        reasons=reasons,
    )
