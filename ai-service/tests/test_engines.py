"""Unit tests for the deterministic scoring engines.

These assert real properties of the actual algorithms (monotonicity,
bounded ranges, keyword traceability) rather than pinning exact numbers,
so they stay meaningful as lexicons/weights are tuned.
"""

from app.engines import emotion_engine, nlp_engine, recommendation_engine, svi_engine


def test_nlp_empty_text_is_zero():
    result = nlp_engine.analyze("")
    assert result.trauma_score == 0
    assert result.threat_score == 0
    assert result.matched_keywords == []


def test_nlp_threat_keywords_detected():
    result = nlp_engine.analyze("They threatened to kill us and burn our house.")
    assert result.threat_score > 0
    assert "kill" in result.matched_keywords
    assert "threat" in result.matched_keywords


def test_nlp_more_threat_language_scores_higher():
    mild = nlp_engine.analyze("There was a small disagreement about the fence.")
    severe = nlp_engine.analyze("They threatened to kill us and burn our house tonight.")
    assert severe.threat_score > mild.threat_score


def test_nlp_suicidal_ideation_flag():
    result = nlp_engine.analyze("I want to die, there is no reason to live anymore.")
    assert result.suicidal_ideation_flag is True


def test_nlp_no_false_positive_substring_match():
    # "white" contains "hit" as a raw substring - a bug found while
    # expanding the evaluation set. Word-boundary-anchored matching should
    # not flag this as a physical-harm indicator.
    result = nlp_engine.analyze("The house has white walls and we painted them ourselves.")
    assert result.matched_keywords == []
    assert result.trauma_score == 0


def test_nlp_stem_terms_still_match_with_suffix():
    # "retaliat" is a deliberate stem for retaliate/retaliation/retaliated -
    # the word-boundary fix must not break intentional stem matching.
    result = nlp_engine.analyze("They said there would be retaliation if we spoke to police.")
    assert "retaliat" in result.matched_keywords


def test_nlp_retaliation_language_raises_threat_score():
    # The "retaliation" lexicon category (warn/consequences/worse-will-
    # happen) was computed but never used anywhere - a real bug. It should
    # now measurably contribute to threat_score.
    baseline = nlp_engine.analyze("I would like to update my address on file.")
    warned = nlp_engine.analyze("They warned us that something worse will happen if we go to the police again.")
    assert warned.threat_score > baseline.threat_score


def test_nlp_detects_threat_and_caste_targeting_in_bengali():
    result = nlp_engine.analyze("তারা আমাদের মেরে ফেলব বলে হুমকি দিয়েছে। আমরা দলিত জাতি।")
    assert result.threat_score > 0
    assert result.caste_targeting_score > 0


def test_nlp_detects_fear_and_isolation_in_tamil():
    result = nlp_engine.analyze("நான் மிகவும் பயந்தேன், நான் தனியாக இருக்கிறேன்.")
    assert result.fear_score > 0
    assert result.isolation_score > 0


def test_nlp_detects_threat_in_telugu():
    result = nlp_engine.analyze("వాళ్ళు నన్ను చంపేస్తాను అని బెదిరింపు చేశారు.")
    assert result.threat_score > 0


def test_nlp_detects_hopelessness_in_kannada():
    result = nlp_engine.analyze("ನನಗೆ ಭರವಸೆ ಇಲ್ಲ, ನಾನು ಒಂಟಿ.")
    assert result.hopelessness_score > 0


def test_nlp_detects_physical_harm_in_odia():
    result = nlp_engine.analyze("ସେମାନେ ମୋତେ ମାଡ଼ ମାରିଲେ ଏବଂ ମୁଁ ଆଘାତ ପାଇଲି।")
    assert result.trauma_score > 0
    assert "ମାଡ଼" in result.matched_keywords


def test_nlp_detects_caste_targeting_in_marathi():
    result = nlp_engine.analyze("आम्ही दलित जात आहोत आणि त्यांनी आम्हाला जीवे मारण्याची धमकी दिली.")
    assert result.caste_targeting_score > 0
    assert result.threat_score > 0


def test_nlp_native_review_flagged_when_unreviewed_language_term_matches():
    # Tamil term with no English/Hindi equivalent in this narrative.
    result = nlp_engine.analyze("நான் மிகவும் பயந்தேன்.")
    assert result.native_review_recommended is True
    assert len(result.native_review_matched_terms) > 0


def test_nlp_native_review_not_flagged_for_english_only_narrative():
    result = nlp_engine.analyze("They threatened to kill us and burn our house.")
    assert result.native_review_recommended is False
    assert result.native_review_matched_terms == []


def test_nlp_native_review_not_flagged_for_hindi_only_narrative():
    # Hindi is NOT one of the six unreviewed languages - it predates task
    # #118 and has had far more testing/scrutiny throughout this project.
    result = nlp_engine.analyze("वे हमें जान से मारने की धमकी दे रहे हैं")
    assert result.native_review_recommended is False


def test_nlp_native_review_flagged_from_suicidal_pattern_alone():
    # Even with zero category-keyword matches, an unreviewed-language
    # suicidal-ideation pattern alone must still raise the flag - this is
    # the highest-stakes case for a false positive/negative.
    result = nlp_engine.analyze("ಆತ್ಮಹತ್ಯೆ")
    assert result.suicidal_ideation_flag is True
    assert result.native_review_recommended is True


def test_nlp_word_count_covers_non_devanagari_indian_scripts():
    # WORD_RE previously only recognized Latin + Devanagari codepoints as
    # "words" - Tamil/Telugu/Kannada/Bengali/Odia text would have scored a
    # word_count of 0, which also silently caps confidence at 55.
    result = nlp_engine.analyze("நான் மிகவும் பயந்தேன்")
    assert result.word_count > 0


def test_nlp_negation_does_not_discount_the_phrase_it_is_part_of():
    # "do not belong" is itself the caste-targeting trigger phrase - the
    # negation scan must not treat its own embedded "not" as negating it.
    with_phrase = nlp_engine.analyze("They said people like us do not belong here.")
    assert with_phrase.caste_targeting_score > 0


def test_svi_bounded_0_to_100():
    inputs = svi_engine.SVIInputs(fear=100, trauma=100, hopelessness=100, anxiety=100, voice_stress=100, isolation=100, threat=100, prior_escalations=5)
    result = svi_engine.compute(inputs)
    assert 0 <= result.value <= 100
    assert result.band == "CRITICAL"


def test_svi_zero_inputs_is_low():
    inputs = svi_engine.SVIInputs(fear=0, trauma=0, hopelessness=0, anxiety=0, voice_stress=0, isolation=0, threat=0)
    result = svi_engine.compute(inputs)
    assert result.value == 0
    assert result.band == "LOW"


def test_svi_suicidal_ideation_floors_the_score():
    # Suicidal ideation was being detected and shown in the UI but had zero
    # effect on the actual score - a real safety gap found while expanding
    # the evaluation set. It must now floor the result at HIGH.
    inputs = svi_engine.SVIInputs(fear=0, trauma=0, hopelessness=0, anxiety=0, voice_stress=0, isolation=0, threat=0, suicidal_ideation_flag=True)
    result = svi_engine.compute(inputs)
    assert result.value >= 55
    assert result.band in ("HIGH", "CRITICAL")


def test_svi_suicidal_floor_does_not_lower_an_already_higher_score():
    inputs = svi_engine.SVIInputs(fear=100, trauma=100, hopelessness=100, anxiety=100, voice_stress=100, isolation=100, threat=100, suicidal_ideation_flag=True)
    result = svi_engine.compute(inputs)
    assert result.band == "CRITICAL"


def test_svi_caste_targeting_and_vulnerability_affect_score():
    # These were computed by the NLP engine but never actually fed into the
    # SVI formula at all - a real gap on a platform specifically about
    # caste-based atrocities against an at-risk population.
    baseline = svi_engine.compute(svi_engine.SVIInputs(fear=0, trauma=0, hopelessness=0, anxiety=0, voice_stress=0, isolation=0, threat=0))
    with_signal = svi_engine.compute(svi_engine.SVIInputs(fear=0, trauma=0, hopelessness=0, anxiety=0, voice_stress=0, isolation=0, threat=0, caste_targeting=80, vulnerability=80))
    assert with_signal.value > baseline.value


def test_svi_contributions_sum_matches_value_before_clamp():
    inputs = svi_engine.SVIInputs(fear=50, trauma=40, hopelessness=20, anxiety=30, voice_stress=10, isolation=15, threat=60)
    result = svi_engine.compute(inputs)
    total_contribution = sum(c.contribution_pct for c in result.contributions)
    assert abs(total_contribution - result.value) < 0.5


def test_emotion_distribution_sums_to_100():
    nlp = nlp_engine.analyze("They threatened to kill us. I am terrified and cannot sleep.")
    emotion = emotion_engine.analyze(nlp, None)
    total = emotion.fear + emotion.anxiety + emotion.distress + emotion.sadness + emotion.anger + emotion.hope + emotion.neutral
    assert abs(total - 100) < 1.0


def test_recommendations_include_police_protection_for_high_threat():
    nlp = nlp_engine.analyze("They threatened to kill us and burn our house tonight.")
    svi = svi_engine.compute(svi_engine.SVIInputs(fear=nlp.fear_score, trauma=nlp.trauma_score, hopelessness=0, anxiety=nlp.fear_score, voice_stress=0, isolation=0, threat=nlp.threat_score))
    recs = recommendation_engine.build(svi, nlp)
    types = [r.type for r in recs]
    assert "COUNSELLING" in types
    if svi.band in ("HIGH", "CRITICAL"):
        assert "POLICE_PROTECTION" in types


def test_recommendations_are_priority_ordered_by_confidence():
    nlp = nlp_engine.analyze("They threatened to kill us and burn our house tonight.")
    svi = svi_engine.compute(svi_engine.SVIInputs(fear=nlp.fear_score, trauma=nlp.trauma_score, hopelessness=0, anxiety=nlp.fear_score, voice_stress=0, isolation=0, threat=nlp.threat_score))
    recs = recommendation_engine.build(svi, nlp)
    confidences = [r.confidence for r in recs]
    assert confidences == sorted(confidences, reverse=True)
