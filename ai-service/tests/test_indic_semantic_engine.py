"""Tests for indic_semantic_engine.py.

Same approach as test_semantic_engine.py and test_translation_engine.py: no
real transformers/torch install or model download here - these verify the
eligibility routing (which language hints activate this engine), the
graceful-degradation contract, the real reference-phrase-extraction logic
against nlp_engine's actual lexicon, and the "no retry after failure"
memoization, using fakes throughout.
"""

from __future__ import annotations

from app.engines import indic_semantic_engine


def test_score_from_similarity_floor_and_ceiling():
    assert indic_semantic_engine._score_from_similarity(indic_semantic_engine.SIMILARITY_FLOOR) == 0.0
    assert indic_semantic_engine._score_from_similarity(indic_semantic_engine.SIMILARITY_CEILING) == 100.0


def test_cosine_similarity_identical_vectors_is_one():
    v = [1.0, 2.0, 3.0]
    assert abs(indic_semantic_engine._cosine_similarity(v, v) - 1.0) < 1e-9


def test_reference_phrases_are_non_english_only():
    refs = indic_semantic_engine._reference_phrases()
    assert refs, "expected at least one category to have non-English reference phrases"
    for category, phrases in refs.items():
        for phrase in phrases:
            assert not indic_semantic_engine._is_english(phrase), f"{category!r} reference phrase {phrase!r} should be non-English"


def test_reference_phrases_includes_suicidal_pseudo_category():
    refs = indic_semantic_engine._reference_phrases()
    assert indic_semantic_engine._SUICIDAL_PSEUDO_CATEGORY in refs


def test_analyze_empty_text_is_unavailable():
    result = indic_semantic_engine.analyze("", "hi")
    assert result.available is False
    assert result.error == "empty_text"


def test_analyze_with_no_language_hint_is_unavailable():
    result = indic_semantic_engine.analyze("some narrative text", None)
    assert result.available is False
    assert result.error == "not_eligible_language"


def test_analyze_english_language_hint_is_not_eligible():
    # English has no native-script reference phrases for this engine to
    # compare against - semantic_engine.py already covers English.
    result = indic_semantic_engine.analyze("some narrative text", "en")
    assert result.available is False
    assert result.error == "not_eligible_language"


def test_analyze_unsupported_language_is_not_eligible():
    result = indic_semantic_engine.analyze("some narrative text", "zz")
    assert result.available is False
    assert result.error == "not_eligible_language"


def test_analyze_eligible_languages_match_lexicon_native_coverage():
    # task #118's 7 non-English lexicon languages, exactly.
    assert indic_semantic_engine.ELIGIBLE_LANGUAGES == {"hi", "bn", "mr", "te", "ta", "kn", "or"}


def test_analyze_respects_disable_config_flag(monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "enable_indic_bert_semantic", False)
    result = indic_semantic_engine.analyze("some narrative text", "hi")
    assert result.available is False
    assert result.error == "disabled_by_config"


def test_analyze_degrades_gracefully_when_model_cannot_load(monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "enable_indic_bert_semantic", True)

    def _raise():
        raise indic_semantic_engine._ModelUnavailable("simulated: no network access")

    monkeypatch.setattr(indic_semantic_engine, "_load_model", _raise)
    result = indic_semantic_engine.analyze("some narrative text", "bn")
    assert result.available is False
    assert "simulated" in result.error


def test_failed_model_load_is_not_retried_on_every_call(monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "enable_indic_bert_semantic", True)
    monkeypatch.setattr(indic_semantic_engine, "_load_attempted", False)
    monkeypatch.setattr(indic_semantic_engine, "_load_result", None)
    monkeypatch.setattr(indic_semantic_engine, "_load_error", None)

    attempts = {"count": 0}

    class _FakeAutoTokenizer:
        @staticmethod
        def from_pretrained(*args, **kwargs):
            attempts["count"] += 1
            raise RuntimeError("simulated network failure")

    class _FakeAutoModel:
        @staticmethod
        def from_pretrained(*args, **kwargs):
            return None

    import sys
    import types

    fake_transformers = types.ModuleType("transformers")
    fake_transformers.AutoTokenizer = _FakeAutoTokenizer
    fake_transformers.AutoModel = _FakeAutoModel
    monkeypatch.setitem(sys.modules, "transformers", fake_transformers)

    for _ in range(5):
        result = indic_semantic_engine.analyze("narrative text", "ta")
        assert result.available is False
    assert attempts["count"] == 1, "the real loader should only be attempted once, not once per call"


class _FakeTokenizer:
    def __call__(self, text, return_tensors, truncation, padding):
        return {"attention_mask": text}


class _FakeModel:
    VECTORS = {
        "dhamki": [1.0, 0.0, 0.0],  # matches a real "threat" category reference term
        "unrelated text": [0.0, 0.0, 1.0],
    }

    def eval(self):
        pass


def test_analyze_full_flow_with_fake_model(monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "enable_indic_bert_semantic", True)
    monkeypatch.setattr(indic_semantic_engine, "_load_model", lambda: (_FakeTokenizer(), _FakeModel()))
    monkeypatch.setattr(indic_semantic_engine, "_embed", lambda tokenizer, model, text: _FakeModel.VECTORS.get(text, [0.0, 1.0, 0.0]))
    monkeypatch.setattr(
        indic_semantic_engine,
        "_reference_embeddings",
        lambda: {"threat": [("dhamki", [1.0, 0.0, 0.0])]},
    )

    result = indic_semantic_engine.analyze("dhamki", "hi")
    assert result.available is True
    assert result.scores["threat"] == 100.0
    assert result.top_matches["threat"][0] == "dhamki"


def test_analyze_unrelated_text_scores_zero(monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "enable_indic_bert_semantic", True)
    monkeypatch.setattr(indic_semantic_engine, "_load_model", lambda: (_FakeTokenizer(), _FakeModel()))
    monkeypatch.setattr(indic_semantic_engine, "_embed", lambda tokenizer, model, text: _FakeModel.VECTORS.get(text, [0.0, 1.0, 0.0]))
    monkeypatch.setattr(
        indic_semantic_engine,
        "_reference_embeddings",
        lambda: {"threat": [("dhamki", [1.0, 0.0, 0.0])]},
    )

    result = indic_semantic_engine.analyze("unrelated text", "hi")
    assert result.available is True
    assert result.scores["threat"] == 0.0
