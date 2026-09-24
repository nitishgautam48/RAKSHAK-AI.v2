"""Scoped negation detection - replaces nlp_engine.py's whole-text negation
penalty with a real, per-occurrence scope check, using negspacy (a NegEx-
style negation detector) over a blank spaCy pipeline.

WHY THIS EXISTS: nlp_engine.py's original negation handling scans the whole
narrative for a negation word ("not"/"never"/Hindi "nahi"/etc.) and applies a
small flat penalty (-15% per negation word found) to EVERY category score,
regardless of where that negation word actually sits relative to which
keyword. "I want to be clear that they did not threaten us and nobody has
been hurt - everything is actually fine now" still reads as an elevated
threat, because the penalty has no idea "not" and "nobody" are actually
sitting right next to "threaten" and "hurt". This module fixes that: it
checks, for each individual keyword MATCH, whether a real negation trigger
is in scope for that specific occurrence, and only discounts that occurrence
- a genuine, unnegated threat mentioned elsewhere in the same narrative is
untouched.

ARCHITECTURE, DELIBERATELY MINIMAL: this does NOT re-implement or replace
nlp_engine.py's own keyword matching (regex-based, already reviewed, already
has its own real-word-boundary/stemming logic - see _term_pattern there).
Lexicon-term spans are found exactly as before; this module's only job is to
answer "is the span at (start, end) inside a negated scope?" for spans
handed to it. Internally: those spans are injected into a spaCy Doc as
generic entities (not re-detected via spaCy's own matcher), and negspacy's
negex pipe does the actual scope/termination-phrase logic on top.

HONESTY NOTE - LANGUAGE COVERAGE IS UNEVEN: negspacy ships a real, tuned
negation-trigger/termination-phrase list for English only (not for any of
the 7 other languages nlp_engine.py's LEXICON covers). For those languages,
this module supplies its own minimal trigger list (nlp_engine.NEGATIONS,
already multilingual) plus universal punctuation terminators (comma,
period) - real positional scoping, a genuine improvement over the old
whole-text penalty, but NOT tuned the way the English path is (no verified
"but"/"however"/"because"-equivalent terminator list per language - that
needs native-speaker review, not guessed). This is disclosed, not hidden:
`covers_language()` below reports which tier a given language gets.

UNLIKE EVERY OTHER OPTIONAL ENGINE IN THIS CODEBASE, THIS ONE NEEDS NO
DOWNLOADED MODEL WEIGHTS - spaCy's blank tokenizer and negspacy's rule
tables ship in the pip packages themselves, so this works even in a sandbox
that blocks HuggingFace/model-weight hosts (install with `uv sync --extra
negation`, see pyproject.toml).
"""

from __future__ import annotations

from dataclasses import dataclass, field

# Real threat/harm keywords that also happen to be common negation-scope
# terminators in everyday English clauses ("because", "since", "when",
# "after") aren't in negspacy's own default termination list - without
# these, "I could not escape BECAUSE they threatened me" lets "not"'s scope
# reach across the clause boundary and wrongly negate the real threat. This
# was found and verified against exactly that sentence during development,
# not guessed.
_EXTRA_ENGLISH_TERMINATIONS = ["because", "since", "when", "after", "so that"]

# Universal, script-independent scope terminators safe to apply to every
# language - punctuation, not a claimed linguistic equivalence.
_UNIVERSAL_TERMINATIONS = [",", ".", ";", "!", "?"]

# Languages negspacy ships a real, tuned termset for. Everything else in
# nlp_engine.LEXICON gets the minimal/untuned tier - see module docstring.
TUNED_LANGUAGES = {"en"}


def covers_language(lang: str) -> str:
    """'tuned' (negspacy's own reviewed trigger/termination list) or
    'minimal' (positional scoping still applies, but only with this
    module's own small trigger list and punctuation-only termination) -
    exposed so callers/staff-facing explainability can be honest about
    which tier applied, not just whether negation scoping ran at all."""
    return "tuned" if lang in TUNED_LANGUAGES else "minimal"


@dataclass
class NegationResult:
    available: bool
    negated_spans: set[tuple[int, int]] = field(default_factory=set)
    error: str | None = None


class _EngineUnavailable(Exception):
    pass


# Manual failure-memoization - same "a plain lru_cache does not cache
# exceptions" reasoning as semantic_engine.py/streaming_transcription.py.
# This engine has no opt-in gate (on by default whenever the optional
# dependency is installed - see config.py's disable_negation_scoping), so a
# failed build must be remembered for the process lifetime, not retried on
# every request.
_build_attempted = False
_pipeline = None
_build_error: str | None = None


def _build_pipeline():
    global _build_attempted, _pipeline, _build_error
    if _build_attempted:
        if _build_error is not None:
            raise _EngineUnavailable(_build_error)
        return _pipeline

    _build_attempted = True
    try:
        # negspacy import registers its "negex" pipeline factory with spaCy
        # as a side effect (`@Language.factory("negex")`) - not referenced
        # by name below, but required before `nlp.add_pipe("negex", ...)`
        # can resolve that string to anything.
        import negspacy.negation  # noqa: F401
        import spacy
    except ImportError as e:
        _build_error = (
            "negation_engine requires the 'spacy' and 'negspacy' packages "
            "(not installed - see ai-service/pyproject.toml's negation extra: "
            "uv sync --extra negation)."
        )
        raise _EngineUnavailable(_build_error) from e

    try:
        # Imported lazily (not at module top) to avoid a circular import -
        # nlp_engine.py imports THIS module to call find_negated_spans().
        from app.engines.nlp_engine import NEGATIONS

        nlp = spacy.blank("xx")
        nlp.add_pipe("sentencizer")

        triggers = sorted({n.lower() for n in NEGATIONS} | {"nobody", "no one", "none", "not anymore"})
        terminations = sorted(set(_UNIVERSAL_TERMINATIONS) | set(_EXTRA_ENGLISH_TERMINATIONS))
        # negspacy's built-in English termset (from its own reviewed
        # preceding/following/pseudo-negation lists) is layered UNDER our
        # additions, not replaced by them - this is what makes the English
        # path "tuned" while every other language only gets the minimal
        # trigger/punctuation list above.
        from negspacy.termsets import termset

        en_patterns = termset("en").get_patterns()
        custom_termset = {
            "pseudo_negations": en_patterns["pseudo_negations"],
            "preceding_negations": sorted(set(en_patterns["preceding_negations"]) | set(triggers)),
            "following_negations": en_patterns["following_negations"],
            "termination": sorted(set(en_patterns["termination"]) | set(terminations)),
        }
        negex_component = nlp.add_pipe("negex", config={"neg_termset": custom_termset, "ent_types": ["LEXTERM"]})
        # Immediately removed from the pipeline's automatic run order (but
        # the built component itself is kept, see find_negated_spans below)
        # - if left in, negex would run as part of every nlp(text) call
        # BEFORE this module gets a chance to inject the real lexicon-term
        # spans as doc.ents (which start out empty on a fresh call), so it
        # would always see zero entities and never flag anything as
        # negated. This was a real bug caught by testing against a case
        # that should have been suppressed and wasn't - not a hypothetical
        # concern.
        nlp.remove_pipe("negex")
        _pipeline = (nlp, negex_component)
        return _pipeline
    except Exception as e:  # noqa: BLE001 - any build failure must degrade, never crash the assessment pipeline
        _build_error = f"negation pipeline build failed: {e}"
        raise _EngineUnavailable(_build_error) from e


def find_negated_spans(text: str, spans: list[tuple[int, int]]) -> NegationResult:
    """`spans` are character (start, end) offsets into `text` for lexicon
    terms already matched elsewhere (see nlp_engine.py's _category_score) -
    this never finds keyword matches itself. Returns which of those exact
    spans fall inside a detected negation's scope. Degrades to
    available=False (an empty negated_spans set, i.e. "treat nothing as
    negated") on any failure - the old whole-text penalty is the caller's
    fallback in that case, so a missing/broken optional dependency can only
    ever mean less precision, never a crash or a silently wrong discount."""
    if not spans:
        return NegationResult(available=True, negated_spans=set())
    try:
        nlp, negex_component = _build_pipeline()
    except _EngineUnavailable as e:
        return NegationResult(available=False, error=str(e))

    try:
        doc = nlp(text)
        ents = []
        for start, end in spans:
            span = doc.char_span(start, end, label="LEXTERM", alignment_mode="expand")
            if span is None:
                continue
            ents.append(span)
        # doc.ents requires non-overlapping spans - lexicon terms can
        # overlap (e.g. a stemmed single word inside a matched multi-word
        # phrase). Longest-span-wins is the same "prefer the more specific
        # match" tie-break spaCy's own filter_spans would apply.
        from spacy.util import filter_spans

        doc.ents = filter_spans(ents)
        # negex is called directly here rather than left in nlp's automatic
        # pipeline - see the comment in _build_pipeline for why: it must
        # run AFTER doc.ents is set to the real lexicon-term spans above,
        # not during nlp(text) when ents is still empty.
        doc = negex_component(doc)
        negated: set[tuple[int, int]] = set()
        for ent in doc.ents:
            if ent._.negex:
                # A filtered-out overlapping span (shorter duplicate) should
                # still count as negated if the span that replaced it was -
                # re-expand from char offsets actually requested rather
                # than only the deduplicated set.
                for start, end in spans:
                    if start >= ent.start_char and end <= ent.end_char:
                        negated.add((start, end))
        return NegationResult(available=True, negated_spans=negated)
    except Exception as e:  # noqa: BLE001 - a per-request processing failure must degrade this one request, not crash it or the whole engine
        return NegationResult(available=False, error=f"negation scoping failed: {e}")
