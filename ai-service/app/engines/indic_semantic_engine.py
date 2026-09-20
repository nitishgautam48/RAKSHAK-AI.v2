"""Native-language semantic (embedding-based) paraphrase detection using
AI4Bharat's IndicBERT - an experimental, opt-in COMPLEMENT to
semantic_engine.py, not a replacement for it.

WHY THIS EXISTS: semantic_engine.py already embeds narratives in ANY
language using a general multilingual sentence-transformer, then compares
them against ENGLISH-ONLY reference phrases - a cross-lingual comparison
that leans entirely on that model's multilingual alignment quality. This
engine instead compares a narrative directly against reference phrases IN
THE SAME INDIC SCRIPT (the lexicon's own Hindi/Bengali/Marathi/Telugu/
Tamil/Kannada/Odia entries - task #118), using a model pretrained
specifically on Indian-language text, rather than routing the comparison
through English at all.

HONEST, LOAD-BEARING CAVEAT - READ BEFORE ENABLING:
IndicBERT (ai4bharat/indic-bert, an ALBERT-based masked-language model) was
NOT fine-tuned for sentence-similarity/retrieval the way sentence-transformer
models are. The original Sentence-BERT paper (Reimers & Gurevych, 2019)
found that naively pooling vanilla BERT-family embeddings for semantic
textual similarity performs POORLY - sometimes worse than simple bag-of-
words baselines - specifically because masked-language-model pretraining
does not optimize for "similar meaning -> similar vector". Mean-pooling
IndicBERT's last hidden layer (what this module does, for lack of a
dedicated pooler) may therefore produce a substantially weaker signal than
semantic_engine.py's purpose-built sentence-transformer, or even no
meaningful signal at all. This has NOT been evaluated against real labeled
data here (see semantic_engine.py's own honesty notes for why not - same
"no reachable host, no ethical basis to fabricate victim narratives"
reasoning applies). Treat this as an unproven experiment, not a trusted
signal, until real evaluation says otherwise - this is exactly why it
defaults to OFF (ENABLE_INDIC_BERT_SEMANTIC) even though semantic_engine.py
itself is on by default.

MODEL: ai4bharat/indic-bert - a lighter (ALBERT-based) IndicBERT variant
covering 12 major Indian languages, via `transformers`+`torch` (the same
new, heavy, opt-in dependency group as translation_engine.py - see that
file's docstring for why it's not a core dependency).

HONESTY NOTES (mirroring semantic_engine.py's):
1. Reference phrases are pulled directly from nlp_engine.LEXICON's non-
   English entries (not hand-duplicated), so this stays in sync as that
   lexicon is edited.
2. Every failure mode degrades to `available=False` - never raises, never
   breaks the assessment pipeline.
3. Blended via max() in main.py, same "can only raise, never lower" rule as
   every other additive signal here - a wrong or unavailable read can never
   suppress a real keyword hit.
4. This sandbox cannot download real IndicBERT weights (same situation as
   every other real-model engine in this codebase) - real behavior can only
   be observed on a machine with actual internet access.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache

from app.engines import nlp_engine

MODEL_NAME = "ai4bharat/indic-bert"

# Same categories semantic_engine.py blends - kept as an independent copy
# (not imported) so this engine's blend set can diverge later without
# coupling to that module's internals.
BLENDABLE_CATEGORIES = ["fear", "threat", "hopelessness", "isolation", "vulnerability", "caste_targeting", "sexual_violence", "custodial_abuse"]

SIMILARITY_FLOOR = 0.45  # unvalidated starting estimate - see module docstring's caveat
SIMILARITY_CEILING = 0.80

_SUICIDAL_PSEUDO_CATEGORY = "suicidal_ideation"

# The 7 non-English languages nlp_engine.LEXICON natively covers (task
# #118) - the only language_hints this engine ever activates for. English
# text has no non-English reference phrases to compare against, and any
# language OUTSIDE this set has no lexicon entries at all to build
# reference phrases from in the first place.
ELIGIBLE_LANGUAGES = {"hi", "bn", "mr", "te", "ta", "kn", "or"}


def _is_english(term: str) -> bool:
    # Mirrors semantic_engine.py's identical one-line helper - not imported
    # from it to keep these two engines independently editable.
    return all(ord(ch) < 128 for ch in term)


@lru_cache(maxsize=1)
def _reference_phrases() -> dict[str, list[str]]:
    """Non-English reference phrases per category, pulled directly from
    nlp_engine's own lexicon - the mirror image of semantic_engine.py's
    English-only _reference_phrases(). Cached since it never changes at
    runtime."""
    refs: dict[str, list[str]] = {}
    for category, terms in nlp_engine.LEXICON.items():
        native_terms = [t for t in terms if not _is_english(t)]
        if native_terms:
            refs[category] = native_terms
    native_suicidal = [p for p in nlp_engine.SUICIDAL_PATTERNS if not _is_english(p)]
    if native_suicidal:
        refs[_SUICIDAL_PSEUDO_CATEGORY] = native_suicidal
    return refs


@dataclass
class IndicSemanticIndicators:
    available: bool
    scores: dict[str, float] = field(default_factory=dict)
    suicidal_ideation_similarity: float = 0.0
    top_matches: dict[str, tuple[str, float]] = field(default_factory=dict)
    model: str = MODEL_NAME
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


# Manual failure-memoization, not @lru_cache - see translation_engine.py's
# identical comment (a plain lru_cache does not cache exceptions; without
# this, a failed load would retry the full attempt on every single call).
_load_attempted = False
_load_result = None  # (tokenizer, model) once successfully loaded
_load_error: str | None = None


def _load_model():
    global _load_attempted, _load_result, _load_error
    if _load_attempted:
        if _load_error is not None:
            raise _ModelUnavailable(_load_error)
        return _load_result

    _load_attempted = True
    try:
        from transformers import AutoModel, AutoTokenizer
    except ImportError as e:
        _load_error = "transformers/torch not installed"
        raise _ModelUnavailable(_load_error) from e
    try:
        tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
        model = AutoModel.from_pretrained(MODEL_NAME)
        model.eval()
        _load_result = (tokenizer, model)
        return _load_result
    except Exception as e:  # noqa: BLE001 - model download/load failure (no network, disk, etc.) must degrade, not raise
        _load_error = f"model load failed: {e}"
        raise _ModelUnavailable(_load_error) from e


def _embed(tokenizer, model, text: str) -> list[float]:
    """Mean-pools IndicBERT's last hidden layer over real (non-padding)
    tokens - the standard fallback when a model has no dedicated sentence
    pooler. See the module docstring's caveat: this is NOT known to be a
    strong similarity signal for an MLM-pretrained model like this one."""
    import torch

    with torch.no_grad():
        inputs = tokenizer(text, return_tensors="pt", truncation=True, padding=True)
        outputs = model(**inputs)
        last_hidden = outputs.last_hidden_state
        mask = inputs["attention_mask"].unsqueeze(-1).expand(last_hidden.size()).float()
        summed = (last_hidden * mask).sum(1)
        counts = mask.sum(1).clamp(min=1e-9)
        pooled = summed / counts
    return pooled[0].tolist()


@lru_cache(maxsize=1)
def _reference_embeddings() -> dict[str, list[tuple[str, list[float]]]]:
    """Embeds every reference phrase once and caches the result - computed
    lazily on first real analyze() call (via the same _load_model trigger),
    not at import time, exactly mirroring semantic_engine.py's identical
    function. Raises _ModelUnavailable if the model itself can't load;
    analyze() is the only caller and handles that."""
    tokenizer, model = _load_model()
    refs = _reference_phrases()
    return {
        category: [(phrase, _embed(tokenizer, model, phrase)) for phrase in phrases]
        for category, phrases in refs.items()
    }


def analyze(text: str, language_hint: str | None) -> IndicSemanticIndicators:
    if not text or not text.strip():
        return IndicSemanticIndicators(available=False, error="empty_text")

    if not language_hint or language_hint.lower() not in ELIGIBLE_LANGUAGES:
        return IndicSemanticIndicators(available=False, error="not_eligible_language")

    from app.config import get_settings

    if not get_settings().enable_indic_bert_semantic:
        return IndicSemanticIndicators(available=False, error="disabled_by_config")

    try:
        tokenizer, model = _load_model()
        ref_embeddings = _reference_embeddings()
        text_embedding = _embed(tokenizer, model, text)
    except _ModelUnavailable as e:
        return IndicSemanticIndicators(available=False, error=str(e))
    except Exception as e:  # noqa: BLE001 - any other embedding failure must degrade, never break the pipeline
        return IndicSemanticIndicators(available=False, error=f"embedding_failed: {e}")

    scores: dict[str, float] = {}
    top_matches: dict[str, tuple[str, float]] = {}
    for category, phrase_embeddings in ref_embeddings.items():
        best_phrase, best_similarity = "", -1.0
        for phrase, embedding in phrase_embeddings:
            similarity = _cosine_similarity(text_embedding, embedding)
            if similarity > best_similarity:
                best_phrase, best_similarity = phrase, similarity
        top_matches[category] = (best_phrase, round(best_similarity, 3))
        if category != _SUICIDAL_PSEUDO_CATEGORY:
            scores[category] = round(_score_from_similarity(best_similarity), 1)

    suicidal_phrase, suicidal_similarity = top_matches.get(_SUICIDAL_PSEUDO_CATEGORY, ("", -1.0))

    return IndicSemanticIndicators(
        available=True,
        scores=scores,
        suicidal_ideation_similarity=round(_score_from_similarity(suicidal_similarity), 1),
        top_matches=top_matches,
        model=MODEL_NAME,
    )
