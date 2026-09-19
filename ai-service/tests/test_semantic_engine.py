"""Tests for semantic_engine.py.

These don't exercise the real fastembed model (this sandbox's egress policy
blocks the model-weight host, same situation as speech_engine.py's Whisper
provider - see semantic_engine.py's docstring) - they verify the actual
math (cosine similarity, floor/ceiling scaling) and the graceful-degradation
contract using a fake, fully-controlled embedding model, plus the real
reference-phrase-extraction logic against nlp_engine's actual lexicon.
"""

from __future__ import annotations

from app.engines import semantic_engine


def test_score_from_similarity_floor_and_ceiling():
    assert semantic_engine._score_from_similarity(semantic_engine.SIMILARITY_FLOOR) == 0.0
    assert semantic_engine._score_from_similarity(semantic_engine.SIMILARITY_FLOOR - 0.1) == 0.0
    assert semantic_engine._score_from_similarity(semantic_engine.SIMILARITY_CEILING) == 100.0
    assert semantic_engine._score_from_similarity(1.0) == 100.0


def test_score_from_similarity_scales_linearly_between_floor_and_ceiling():
    midpoint = (semantic_engine.SIMILARITY_FLOOR + semantic_engine.SIMILARITY_CEILING) / 2
    assert abs(semantic_engine._score_from_similarity(midpoint) - 50.0) < 0.01


def test_cosine_similarity_identical_vectors_is_one():
    v = [1.0, 2.0, 3.0]
    assert abs(semantic_engine._cosine_similarity(v, v) - 1.0) < 1e-9


def test_cosine_similarity_orthogonal_vectors_is_zero():
    assert semantic_engine._cosine_similarity([1.0, 0.0], [0.0, 1.0]) == 0.0


def test_reference_phrases_are_english_only():
    refs = semantic_engine._reference_phrases()
    for category, phrases in refs.items():
        for phrase in phrases:
            assert all(ord(ch) < 128 for ch in phrase), f"{category!r} reference phrase {phrase!r} is not English-only"


def test_reference_phrases_includes_suicidal_pseudo_category_from_nlp_engine():
    refs = semantic_engine._reference_phrases()
    assert semantic_engine._SUICIDAL_PSEUDO_CATEGORY in refs
    assert "want to die" in refs[semantic_engine._SUICIDAL_PSEUDO_CATEGORY]


def test_analyze_empty_text_is_unavailable():
    result = semantic_engine.analyze("")
    assert result.available is False
    assert result.error == "empty_text"


def test_analyze_respects_disable_config_flag(monkeypatch):
    from app.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "disable_semantic_analysis", True)
    result = semantic_engine.analyze("they threatened to kill us")
    assert result.available is False
    assert result.error == "disabled_by_config"


def test_analyze_degrades_gracefully_when_model_cannot_load(monkeypatch):
    def _raise():
        raise semantic_engine._ModelUnavailable("simulated: no network access")

    monkeypatch.setattr(semantic_engine, "_load_model", _raise)
    result = semantic_engine.analyze("some narrative text")
    assert result.available is False
    assert "simulated" in result.error


def test_failed_model_load_is_not_retried_on_every_call(monkeypatch):
    # Real bug avoided: a plain lru_cache doesn't cache exceptions, so
    # without _load_attempted/_load_error tracking, a failed load (e.g. no
    # network in this sandbox) would re-attempt the full load/download on
    # EVERY single call - a real per-request latency/network cost, not a
    # one-time failure. This confirms the underlying loader only actually
    # runs once even across many failed analyze() calls.
    monkeypatch.setattr(semantic_engine, "_load_attempted", False)
    monkeypatch.setattr(semantic_engine, "_load_result", None)
    monkeypatch.setattr(semantic_engine, "_load_error", None)

    attempts = {"count": 0}

    def _fake_text_embedding(model_name):
        attempts["count"] += 1
        raise RuntimeError("simulated network failure")

    import sys
    import types

    fake_fastembed = types.ModuleType("fastembed")
    fake_fastembed.TextEmbedding = _fake_text_embedding
    monkeypatch.setitem(sys.modules, "fastembed", fake_fastembed)

    for _ in range(5):
        result = semantic_engine.analyze("narrative text")
        assert result.available is False
    assert attempts["count"] == 1, "the real loader should only be attempted once, not once per call"


class _FakeModel:
    """Deterministic fake standing in for fastembed's TextEmbedding - maps
    known strings to known vectors so similarity can be computed by hand."""

    VECTORS = {
        "they threatened to kill us": [1.0, 0.0, 0.0],
        "the weather is nice today": [0.0, 1.0, 0.0],
        "i want to die": [1.0, 0.0, 0.0],  # identical to the threat vector on purpose, for a controlled test
    }

    def embed(self, texts):
        return [self.VECTORS.get(t, [0.0, 0.0, 1.0]) for t in texts]


def test_analyze_full_flow_with_fake_model(monkeypatch):
    monkeypatch.setattr(semantic_engine, "_load_model", lambda: _FakeModel())
    monkeypatch.setattr(
        semantic_engine,
        "_reference_embeddings",
        lambda: {
            "threat": [("they threatened to kill us", [1.0, 0.0, 0.0])],
            semantic_engine._SUICIDAL_PSEUDO_CATEGORY: [("i want to die", [1.0, 0.0, 0.0])],
        },
    )

    result = semantic_engine.analyze("they threatened to kill us")
    assert result.available is True
    # Exact match to the reference phrase -> cosine similarity 1.0 -> score 100.
    assert result.scores["threat"] == 100.0
    assert result.suicidal_ideation_similarity == 100.0
    assert result.top_matches["threat"][0] == "they threatened to kill us"


def test_analyze_unrelated_text_scores_zero(monkeypatch):
    monkeypatch.setattr(semantic_engine, "_load_model", lambda: _FakeModel())
    monkeypatch.setattr(
        semantic_engine,
        "_reference_embeddings",
        lambda: {"threat": [("they threatened to kill us", [1.0, 0.0, 0.0])]},
    )

    result = semantic_engine.analyze("the weather is nice today")
    assert result.available is True
    assert result.scores["threat"] == 0.0
