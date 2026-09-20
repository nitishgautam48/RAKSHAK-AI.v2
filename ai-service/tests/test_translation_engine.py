"""Tests for translation_engine.py.

Same approach as test_semantic_engine.py: no real transformers/torch install
or model download here (this sandbox can't reach the model-weight host
anyway - see translation_engine.py's docstring) - these verify the routing
logic (which languages get translated vs. skipped) and the graceful-
degradation contract using fakes, plus the real "no retry after failure"
memoization behavior.
"""

from __future__ import annotations

from app.engines import translation_engine


def test_translate_empty_text_is_unavailable():
    result = translation_engine.translate_to_english("", "pa")
    assert result.available is False
    assert result.error == "empty_text"


def test_translate_with_no_language_hint_is_unavailable():
    result = translation_engine.translate_to_english("some narrative text", None)
    assert result.available is False
    assert result.error == "no_language_hint"


def test_translate_skips_languages_the_lexicon_already_covers():
    # Hindi is one of nlp_engine.LEXICON's 8 native languages (task #118) -
    # translating it would add a real failure surface for no coverage gain.
    for lang in ["en", "hi", "bn", "mr", "te", "ta", "kn", "or", "HI", "En"]:
        result = translation_engine.translate_to_english("some narrative text", lang)
        assert result.available is False
        assert result.error == "lexicon_already_covers_language"


def test_translate_unsupported_language_is_unavailable():
    result = translation_engine.translate_to_english("some narrative text", "zz")
    assert result.available is False
    assert result.error == "unsupported_language:zz"


def test_translate_respects_disable_config_flag(monkeypatch):
    from app.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "enable_indic_translation", False)
    result = translation_engine.translate_to_english("some narrative text", "pa")
    assert result.available is False
    assert result.error == "disabled_by_config"


def test_translate_degrades_gracefully_when_model_cannot_load(monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "enable_indic_translation", True)

    def _raise():
        raise translation_engine._ModelUnavailable("simulated: no network access")

    monkeypatch.setattr(translation_engine, "_load_model", _raise)
    result = translation_engine.translate_to_english("some narrative text", "gu")
    assert result.available is False
    assert "simulated" in result.error


def test_failed_model_load_is_not_retried_on_every_call(monkeypatch):
    # Same real bug class already found in semantic_engine.py: a plain
    # lru_cache doesn't cache exceptions, so without _load_attempted/
    # _load_error tracking, a failed load would re-attempt on EVERY call.
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "enable_indic_translation", True)
    monkeypatch.setattr(translation_engine, "_load_attempted", False)
    monkeypatch.setattr(translation_engine, "_load_result", None)
    monkeypatch.setattr(translation_engine, "_load_error", None)

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
    fake_transformers.AutoModelForSeq2SeqLM = _FakeAutoModel
    monkeypatch.setitem(sys.modules, "transformers", fake_transformers)

    for _ in range(5):
        result = translation_engine.translate_to_english("narrative text", "pa")
        assert result.available is False
    assert attempts["count"] == 1, "the real loader should only be attempted once, not once per call"


class _FakeTokenizer:
    def __call__(self, text, return_tensors, src_lang, tgt_lang):
        return {"input_ids": [text]}

    def batch_decode(self, generated, skip_special_tokens):
        return [f"[translated] {generated[0]}"]


class _FakeModel:
    def generate(self, **inputs):
        return [inputs["input_ids"][0]]


def test_translate_full_flow_with_fake_model(monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "enable_indic_translation", True)
    monkeypatch.setattr(translation_engine, "_load_model", lambda: (_FakeTokenizer(), _FakeModel()))

    result = translation_engine.translate_to_english("kise madad chahide", "pa")
    assert result.available is True
    assert result.translated_text == "[translated] kise madad chahide"
    assert result.source_language == "pa"
    assert result.model == translation_engine.MODEL_NAME
