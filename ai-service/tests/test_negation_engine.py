"""Tests for negation_engine.py.

Unlike semantic_engine.py/speech_engine.py's Whisper provider, this
module's dependencies (spacy, negspacy) need no downloaded model weights -
negspacy is a rule-based NegEx implementation over a blank spaCy tokenizer -
so these tests exercise the REAL pipeline, not a fake stand-in, whenever the
optional `negation` extra is installed (see pyproject.toml). Skipped, not
failed, when it isn't - this is genuinely an opt-in dependency for any
environment that hasn't installed it.
"""

from __future__ import annotations

import pytest

pytest.importorskip("negspacy")

from app.engines import negation_engine


def _span(text: str, term: str) -> tuple[int, int]:
    start = text.index(term)
    return start, start + len(term)


def test_negated_keyword_is_detected():
    text = "i want to be clear that they did not threaten us."
    threaten_span = _span(text, "threaten")
    result = negation_engine.find_negated_spans(text, [threaten_span])
    assert result.available is True
    assert threaten_span in result.negated_spans


def test_no_one_is_not_treated_as_a_generic_negation_trigger():
    # Regression test for a real bug found by running the full eval
    # harness: "nobody"/"no one" were tried as extra negation triggers (to
    # catch "nobody has been hurt") and reverted, because nlp_engine.
    # LEXICON's isolation category uses "no one"-led phrases as ITS OWN
    # trigger phrases ("no one helps", "no one will", "will speak to us").
    # "No one in the village will speak to us anymore" is the isolation
    # signal itself - treating "no one" as a negation trigger wrongly
    # suppressed "will speak to us" here.
    text = "no one in the village will speak to us anymore."
    target_span = _span(text, "will speak to us")
    result = negation_engine.find_negated_spans(text, [target_span])
    assert result.available is True
    assert target_span not in result.negated_spans


def test_real_unnegated_threat_is_not_suppressed():
    text = "they threatened to kill me tonight."
    threaten_span = _span(text, "threaten")
    kill_span = _span(text, "kill")
    result = negation_engine.find_negated_spans(text, [threaten_span, kill_span])
    assert result.available is True
    assert result.negated_spans == set()


def test_subordinate_clause_does_not_let_negation_over_reach():
    # Regression test for a real over-reach risk found and verified during
    # development: without "because" as a scope terminator, "not"'s scope
    # would reach across the clause boundary and wrongly negate a genuine,
    # separate threat.
    text = "i was not able to escape because they threatened me."
    threaten_span = _span(text, "threaten")
    result = negation_engine.find_negated_spans(text, [threaten_span])
    assert result.available is True
    assert threaten_span not in result.negated_spans


def test_negation_trigger_word_inside_a_legitimate_phrase_does_not_self_suppress():
    # "not" appearing as part of the caste-targeting trigger phrase itself
    # ("do not belong") must not be treated as negating that very phrase -
    # same collision nlp_engine.py's original whole-text penalty already
    # guarded against by blanking matched multi-word phrases first.
    text = "they said people like us do not belong here."
    phrase_span = _span(text, "do not belong")
    result = negation_engine.find_negated_spans(text, [phrase_span])
    assert result.available is True
    assert phrase_span not in result.negated_spans


def test_empty_spans_returns_available_with_nothing_negated():
    result = negation_engine.find_negated_spans("some narrative text.", [])
    assert result.available is True
    assert result.negated_spans == set()


def test_covers_language_reports_tuned_only_for_english():
    assert negation_engine.covers_language("en") == "tuned"
    assert negation_engine.covers_language("hi") == "minimal"
    assert negation_engine.covers_language("bn") == "minimal"
