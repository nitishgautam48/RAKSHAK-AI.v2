"""Semantic (embedding-based) paraphrase detection - a free, local, no-API-key
additive signal for the same structural gap llm_engine.py addresses, using a
different mechanism: nlp_engine.py's keyword matching requires a real
narrative to contain one of a fixed set of exact strings ("end my life"), so
"end UP my life" or any wording nobody thought to add scores zero regardless
of what it actually means. Sentence embeddings represent MEANING rather than
exact wording, so a paraphrase can still match a reference phrase it never
saw verbatim.

WHY THIS EXISTS ALONGSIDE llm_engine.py, NOT INSTEAD OF IT: the LLM engine
reads with genuine comprehension but costs real money per call and needs an
API key - a real deployment decision. This is free and runs entirely locally
(via fastembed, an ONNX-runtime-based embedding library - no PyTorch, no API,
no per-call cost), so it can be on by default. It is a much cruder signal
than an LLM read (similarity-to-reference-phrase, not actual understanding),
but it costs nothing and needs no configuration.

MODEL: sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2 via
fastembed, chosen specifically because it's multilingual - nlp_engine.py's
lexicon now spans 8 languages (task #118), and an English-only embedding
model would only help part of that audience. fastembed downloads and caches
this model (~220MB) automatically on first use, same "needs real internet,
can't be exercised in a network-restricted sandbox" situation as
speech_engine.py's LocalWhisperProvider - see that file's docstring for the
full explanation, identical reasoning applies here.

HONESTY NOTES:
1. Reference phrases per category are the ENGLISH keyword lists nlp_engine.py
   already uses (not hand-duplicated - see _english_reference_phrases below),
   so this stays in sync with the lexicon automatically as it's edited.
2. SIMILARITY_FLOOR/CEILING below are starting estimates in the range
   generally reported for this model family on semantically-related-but-
   differently-worded sentence pairs, NOT independently tuned against this
   app's real traffic - the same caveat semanticAnalyzer.js (a predecessor
   project's equivalent module) already gave for its own thresholds, and the
   honest thing to say here too.
3. Exactly like llm_engine.py: this can only RAISE a category score (blended
   via max() in main.py), never lower one below what keyword matching found.
   A wrong or unavailable semantic read can never suppress a real keyword hit.
4. Every failure mode (fastembed not installed, model not downloaded/no
   network, any exception) degrades to `available=False` - never raises,
   never breaks the assessment pipeline.
5. Not a clinical instrument, not validated on real labeled data - a better
   paraphrase-catcher than a keyword list, nothing more.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache

from app.engines import nlp_engine

MODEL_NAME = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"

# Reference phrases are pulled from ALL of nlp_engine.LEXICON's categories
# (see _reference_phrases below), but only these map onto a real
# NlpIndicators.{category}_score field main.py can blend into - "retaliation"
# and "physical_harm" are real LEXICON categories that get folded into
# threat_score/trauma_score by nlp_engine's own weighted formula rather than
# having their own output field, and "trauma_score" itself is a composite
# with no matching LEXICON category to build reference phrases from at all.
# Kept in `scores`/`top_matches` for transparency even when not blendable.
BLENDABLE_CATEGORIES = ["fear", "threat", "hopelessness", "isolation", "vulnerability", "caste_targeting"]

# Cosine similarity from this model for genuinely related-but-differently-
# worded sentences typically lands well above unrelated-sentence similarity,
# but the exact cutoffs are a starting estimate - see honesty note 2 above.
SIMILARITY_FLOOR = 0.45  # below this: no signal (score 0)
SIMILARITY_CEILING = 0.80  # at/above this: full signal (score 100)

# A pseudo-category (not one of nlp_engine's scored categories) so a semantic
# match against suicidal-ideation phrasing can feed suicidal_ideation_flag
# the same "OR" way the structural regex in nlp_engine.py does - see
# main.py's blending code for how this is actually used.
_SUICIDAL_PSEUDO_CATEGORY = "suicidal_ideation"


def _is_english(term: str) -> bool:
    return all(ord(ch) < 128 for ch in term)


@lru_cache(maxsize=1)
def _reference_phrases() -> dict[str, list[str]]:
    """English-only reference phrases per category, pulled directly from
    nlp_engine's own lexicon rather than a hand-duplicated list - stays in
    sync automatically as that lexicon is edited. Cached since it never
    changes at runtime."""
    refs: dict[str, list[str]] = {}
    for category, terms in nlp_engine.LEXICON.items():
        english_terms = [t for t in terms if _is_english(t)]
        if english_terms:
            refs[category] = english_terms
    english_suicidal = [p for p in nlp_engine.SUICIDAL_PATTERNS if _is_english(p)]
    if english_suicidal:
        refs[_SUICIDAL_PSEUDO_CATEGORY] = english_suicidal
    return refs


@dataclass
class SemanticIndicators:
    available: bool
    scores: dict[str, float] = field(default_factory=dict)  # 0-100 per nlp_engine category, only present if available
    suicidal_ideation_similarity: float = 0.0  # 0-100, separate from `scores` - see _SUICIDAL_PSEUDO_CATEGORY
    top_matches: dict[str, tuple[str, float]] = field(default_factory=dict)  # category -> (closest reference phrase, raw cosine similarity)
    model: str = ""
    error: str | None = None  # set (available=False) on any failure - never raises


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = sum(x * x for x in a) ** 0.5
    norm_b = sum(y * y for y in b) ** 0.5
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def _score_from_similarity(similarity: float) -> float:
    if similarity <= SIMILARITY_FLOOR:
        return 0.0
    if similarity >= SIMILARITY_CEILING:
        return 100.0
    return 100.0 * (similarity - SIMILARITY_FLOOR) / (SIMILARITY_CEILING - SIMILARITY_FLOOR)


class _ModelUnavailable(Exception):
    pass


# A plain lru_cache does NOT cache exceptions - only successful return
# values. Without this, a failed load (no network to fetch the model, e.g.
# this sandbox, or any environment without cached weights yet) would retry
# the full load/download attempt on EVERY single /v1/assess call forever,
# each one paying a real network round-trip's worth of latency - a much
# worse failure mode than speech_engine.py's Whisper provider, which is
# opt-in (STT_PROVIDER must be explicitly set), or llm_engine.py, which
# short-circuits instantly with no network call at all when no API key is
# configured. This engine has no such opt-in gate (see main.py: it's on by
# default, no cost/key needed), so a failed load is remembered for the rest
# of the process's lifetime instead - restart the service to retry (e.g.
# after fixing network access), same as any other "picked up at startup"
# configuration in this codebase.
_load_attempted = False
_load_result = None  # the loaded model, once successfully loaded
_load_error: str | None = None  # the failure reason, once a load attempt has failed


def _load_model():
    """Lazy singleton - loaded on first real use, not at import time, so
    importing this module (e.g. for tests) never triggers a model download.
    Raises _ModelUnavailable on any failure (package missing, model can't be
    fetched/loaded) rather than letting the real exception surface, since
    every caller treats "no model" as one thing regardless of cause. See the
    module-level _load_attempted/_load_error note above for why failures are
    remembered rather than retried per-call."""
    global _load_attempted, _load_result, _load_error
    if _load_attempted:
        if _load_error is not None:
            raise _ModelUnavailable(_load_error)
        return _load_result

    _load_attempted = True
    try:
        from fastembed import TextEmbedding
    except ImportError as e:
        _load_error = "fastembed not installed"
        raise _ModelUnavailable(_load_error) from e
    try:
        _load_result = TextEmbedding(model_name=MODEL_NAME)
        return _load_result
    except Exception as e:  # noqa: BLE001 - model download/load failure (no network, disk, etc.) must degrade, not raise
        _load_error = f"model load failed: {e}"
        raise _ModelUnavailable(_load_error) from e


@lru_cache(maxsize=1)
def _reference_embeddings() -> dict[str, list[tuple[str, list[float]]]]:
    """Embeds every reference phrase once and caches the result - computed
    lazily on first real analyze() call (via the same _load_model trigger),
    not at import time. Raises _ModelUnavailable if the model itself can't
    load; analyze() is the only caller and handles that."""
    model = _load_model()
    refs = _reference_phrases()
    all_phrases = [p for phrases in refs.values() for p in phrases]
    embeddings = list(model.embed(all_phrases))
    embedding_by_phrase = dict(zip(all_phrases, (list(e) for e in embeddings)))
    return {category: [(p, embedding_by_phrase[p]) for p in phrases] for category, phrases in refs.items()}


def analyze(text: str) -> SemanticIndicators:
    if not text or not text.strip():
        return SemanticIndicators(available=False, error="empty_text")

    from app.config import get_settings

    if get_settings().disable_semantic_analysis:
        return SemanticIndicators(available=False, error="disabled_by_config")

    try:
        model = _load_model()
        refs = _reference_embeddings()
        text_embedding = list(list(model.embed([text]))[0])
    except _ModelUnavailable as e:
        return SemanticIndicators(available=False, error=str(e))
    except Exception as e:  # noqa: BLE001 - any other embedding failure must degrade, never break the pipeline
        return SemanticIndicators(available=False, error=f"embedding_failed: {e}")

    scores: dict[str, float] = {}
    top_matches: dict[str, tuple[str, float]] = {}
    for category, phrase_embeddings in refs.items():
        best_phrase, best_similarity = "", -1.0
        for phrase, embedding in phrase_embeddings:
            similarity = _cosine_similarity(text_embedding, embedding)
            if similarity > best_similarity:
                best_phrase, best_similarity = phrase, similarity
        top_matches[category] = (best_phrase, round(best_similarity, 3))
        if category != _SUICIDAL_PSEUDO_CATEGORY:
            scores[category] = round(_score_from_similarity(best_similarity), 1)

    suicidal_phrase, suicidal_similarity = top_matches.get(_SUICIDAL_PSEUDO_CATEGORY, ("", -1.0))

    return SemanticIndicators(
        available=True,
        scores=scores,
        suicidal_ideation_similarity=round(_score_from_similarity(suicidal_similarity), 1),
        top_matches=top_matches,
        model=MODEL_NAME,
    )
