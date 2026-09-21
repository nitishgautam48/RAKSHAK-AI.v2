from app.engines import crisis_triage_engine
from app.engines.emotion_engine import EmotionDistribution
from app.engines.nlp_engine import NlpIndicators


def _nlp(threat_score: float = 0.0, suicidal_ideation_flag: bool = False) -> NlpIndicators:
    return NlpIndicators(
        trauma_score=0.0,
        fear_score=0.0,
        isolation_score=0.0,
        threat_score=threat_score,
        hopelessness_score=0.0,
        vulnerability_score=0.0,
        caste_targeting_score=0.0,
        confidence=80.0,
        suicidal_ideation_flag=suicidal_ideation_flag,
    )


def _emotion(distress: float = 0.0) -> EmotionDistribution:
    return EmotionDistribution(
        fear=0.0,
        anxiety=0.0,
        distress=distress,
        sadness=0.0,
        anger=0.0,
        hope=0.0,
        neutral=0.0,
        dominant_emotion="neutral",
        severity_index=0.0,
    )


def test_no_signal_is_none():
    result = crisis_triage_engine.assess(_nlp(), _emotion())
    assert result.level == "NONE"
    assert result.severe_signals == []
    assert result.elevated_signals == []


def test_suicidal_ideation_alone_reaches_high_not_critical():
    # Mirrors svi_engine.py's own SUICIDAL_IDEATION_FLOOR precedent - a
    # single severe signal reaches HIGH, not CRITICAL; CRITICAL is reserved
    # for combined signals.
    result = crisis_triage_engine.assess(_nlp(suicidal_ideation_flag=True), _emotion())
    assert result.level == "HIGH"
    assert result.severe_signals == ["suicidal_ideation"]


def test_severe_threat_alone_reaches_high_not_critical():
    result = crisis_triage_engine.assess(_nlp(threat_score=80.0), _emotion())
    assert result.level == "HIGH"
    assert result.severe_signals == ["threat"]


def test_severe_distress_alone_reaches_high_not_critical():
    result = crisis_triage_engine.assess(_nlp(), _emotion(distress=85.0))
    assert result.level == "HIGH"
    assert result.severe_signals == ["emotional_distress"]


def test_two_severe_signals_together_reach_critical():
    result = crisis_triage_engine.assess(_nlp(threat_score=80.0, suicidal_ideation_flag=True), _emotion())
    assert result.level == "CRITICAL"
    assert set(result.severe_signals) == {"suicidal_ideation", "threat"}


def test_all_three_severe_signals_reach_critical():
    result = crisis_triage_engine.assess(_nlp(threat_score=90.0, suicidal_ideation_flag=True), _emotion(distress=90.0))
    assert result.level == "CRITICAL"
    assert set(result.severe_signals) == {"suicidal_ideation", "threat", "emotional_distress"}


def test_elevated_but_not_severe_signal_reaches_elevated():
    result = crisis_triage_engine.assess(_nlp(threat_score=35.0), _emotion())
    assert result.level == "ELEVATED"
    assert result.elevated_signals == ["threat"]
    assert result.severe_signals == []


def test_elevated_threat_and_elevated_distress_together_still_only_elevated():
    # Two ELEVATED-tier signals do not combine into HIGH/CRITICAL - only
    # signals reaching their own "severe" threshold count toward that
    # escalation, by design (see module docstring).
    result = crisis_triage_engine.assess(_nlp(threat_score=35.0), _emotion(distress=45.0))
    assert result.level == "ELEVATED"
    assert set(result.elevated_signals) == {"threat", "emotional_distress"}
    assert result.severe_signals == []


def test_score_reflects_suicidal_ideation_as_maximal():
    result = crisis_triage_engine.assess(_nlp(threat_score=10.0, suicidal_ideation_flag=True), _emotion(distress=10.0))
    assert result.score == 100.0


def test_score_is_max_of_threat_and_distress_when_not_suicidal():
    result = crisis_triage_engine.assess(_nlp(threat_score=62.0), _emotion(distress=20.0))
    assert result.score == 62.0


def test_reasons_are_populated_for_every_firing_signal():
    result = crisis_triage_engine.assess(_nlp(threat_score=80.0, suicidal_ideation_flag=True), _emotion(distress=90.0))
    assert len(result.reasons) == 3


def test_reasons_state_no_signal_when_level_is_none():
    result = crisis_triage_engine.assess(_nlp(), _emotion())
    assert any("no elevated" in r.lower() for r in result.reasons)
