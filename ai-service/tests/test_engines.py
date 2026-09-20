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


def test_nlp_suicidal_ideation_flag_catches_real_reported_wording_variance():
    # Real bug found via live testing: "end my life" (the literal phrase in
    # SUICIDAL_PATTERNS) did not match "end UP my life" - one extra word
    # broke a plain substring check entirely, and the sentence scored
    # completely clean (suicidal_ideation_flag=False, all category scores
    # 0). This must now be caught by the structural end...life pattern.
    result = nlp_engine.analyze("nobody is there for me i think that i should end up my life right now")
    assert result.suicidal_ideation_flag is True
    assert result.isolation_score > 0  # "nobody" - also missing before this fix


def test_nlp_suicidal_ideation_end_life_pattern_does_not_require_exact_phrase():
    variants = [
        "i want to end my own life",
        "i am going to end this life",
        "he wants to end his life",
    ]
    for text in variants:
        assert nlp_engine.analyze(text).suicidal_ideation_flag is True, f"failed for: {text}"


def test_nlp_dont_want_to_live_catches_real_reported_narrative():
    # Real bug found via live testing: "i don't want to live this life
    # anymore" scored SVI 23 (should hit the 55-point suicidal-ideation
    # safety floor) because neither SUICIDAL_PATTERNS nor any structural
    # pattern covered "don't want to live" phrasing, and the hopelessness
    # lexicon didn't have it either (hopelessness_score was 0).
    result = nlp_engine.analyze("i don't want to live this life anymore")
    assert result.suicidal_ideation_flag is True
    assert result.hopelessness_score > 0


def test_nlp_dont_want_to_live_pattern_does_not_require_exact_phrase():
    variants = [
        "i dont want to live this life anymore",
        "i do not want to live anymore",
        "she no longer wants to live",
        "i can't go on living like this",
    ]
    for text in variants:
        assert nlp_engine.analyze(text).suicidal_ideation_flag is True, f"failed for: {text}"


def test_nlp_sexual_violence_keyword_detected():
    result = nlp_engine.analyze("she was raped by the landlord's son")
    assert result.sexual_violence_score > 0
    assert "raped" in result.matched_keywords
    # A severe, specific signal should also push the trauma composite up.
    assert result.trauma_score > 0


def test_nlp_sexual_violence_structural_pattern_does_not_require_exact_phrase():
    # No literal "rape"/"molest"/"assault" keyword here - only the
    # structural "forced ... on/upon" construction.
    result = nlp_engine.analyze("he forced himself on her when no one else was home")
    assert result.sexual_violence_score > 0
    assert any(t.startswith("(pattern)") for t in result.matched_keywords)


def test_nlp_custodial_abuse_keyword_detected():
    result = nlp_engine.analyze("he died in police custody after being beaten in custody")
    assert result.custodial_abuse_score > 0
    # Custodial abuse is folded into threat_score - an authority abusing
    # its own custody power is an active threat pattern, not just history.
    assert result.threat_score > 0


def test_nlp_custodial_abuse_structural_pattern_does_not_require_exact_phrase():
    # Word order the literal phrase list doesn't cover: "death ... custody"
    # rather than "died in custody"/"custodial death".
    result = nlp_engine.analyze("the death occurred while he was held in judicial custody")
    assert result.custodial_abuse_score > 0


def test_nlp_threat_future_violence_structural_pattern_does_not_require_exact_phrase():
    # "harm" (unlike "kill"/"beat"/"burn"/"attack") isn't itself a listed
    # threat keyword, and there's no "threat"/"dhamki"/etc. word here either
    # - only the future-tense construction should fire this.
    result = nlp_engine.analyze("they will harm us again tomorrow if we do not leave")
    assert result.threat_score > 0
    assert any(t.startswith("(pattern)") for t in result.matched_keywords)


def test_nlp_new_categories_never_lower_an_existing_score():
    # Sanity check on the composite-formula rewrite: a narrative with only
    # the ORIGINAL categories (no sexual_violence/custodial_abuse signal at
    # all) must score identically to before this change - the new terms are
    # additive only.
    result = nlp_engine.analyze("They threatened to kill us and burn our house.")
    assert result.sexual_violence_score == 0
    assert result.custodial_abuse_score == 0
    assert result.threat_score > 0


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


def test_svi_severe_atrocity_floors_the_score():
    # Real gap found via live testing: a disclosed rape ("she was raped by
    # the landlord's son...") only fed SVI indirectly through trauma_score's
    # diluted 0.35 weight, capping its own contribution to SVI at roughly 14
    # points - the assessment landed in the LOW band. Sexual violence and
    # custodial abuse are severe enough on their own to floor the score at
    # HIGH, the same way suicidal ideation already does.
    inputs = svi_engine.SVIInputs(fear=0, trauma=0, hopelessness=0, anxiety=0, voice_stress=0, isolation=0, threat=0, sexual_violence_score=70)
    result = svi_engine.compute(inputs)
    assert result.value >= 55
    assert result.band in ("HIGH", "CRITICAL")


def test_svi_custodial_abuse_also_floors_the_score():
    inputs = svi_engine.SVIInputs(fear=0, trauma=0, hopelessness=0, anxiety=0, voice_stress=0, isolation=0, threat=0, custodial_abuse_score=60)
    result = svi_engine.compute(inputs)
    assert result.value >= 55
    assert result.band in ("HIGH", "CRITICAL")


def test_svi_severe_atrocity_floor_does_not_lower_an_already_higher_score():
    inputs = svi_engine.SVIInputs(fear=100, trauma=100, hopelessness=100, anxiety=100, voice_stress=100, isolation=100, threat=100, sexual_violence_score=100)
    result = svi_engine.compute(inputs)
    assert result.band == "CRITICAL"


def test_svi_severe_atrocity_floor_requires_the_threshold():
    # A low, borderline sexual_violence_score (below the 50-point
    # activation threshold) should NOT trigger the floor - this is a safety
    # floor for a credible severe signal, not a hair-trigger on any nonzero
    # value.
    inputs = svi_engine.SVIInputs(fear=0, trauma=0, hopelessness=0, anxiety=0, voice_stress=0, isolation=0, threat=0, sexual_violence_score=10)
    result = svi_engine.compute(inputs)
    assert result.value < 55


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
