"""Indic-to-English translation - a free-to-run-in-principle (no per-call API
cost), opt-in bridge for narratives in Indian languages the NLP lexicon does
NOT natively cover, using AI4Bharat's IndicTrans2 (indic-en direction).

WHY THIS EXISTS: nlp_engine.py's lexicon covers English, Hindi, Bengali,
Marathi, Telugu, Tamil, Kannada, and Odia (task #118) - 8 of the 22
scheduled Indian languages. A narrative in any of the other 14 (Punjabi,
Gujarati, Malayalam, Assamese, Urdu, etc.) has ZERO native keyword coverage
today; the lexicon simply finds nothing, regardless of how severe the
narrative actually is. This engine translates such a narrative to English so
the LLM engine (llm_engine.py) and semantic engine (semantic_engine.py) -
both of which can meaningfully process English text - get a real shot at it,
instead of silently seeing nothing to work with.

WHY NOT REPLACE THE LEXICON WITH THIS FOR THE 8 ALREADY-COVERED LANGUAGES:
translating Hindi/Bengali/etc. to English and back through a second model
adds a real failure surface (translation errors, tone/nuance loss on
distress-specific phrasing) for languages that already have direct, native
keyword coverage. This engine is deliberately scoped to the LANGUAGE-COVERAGE
GAP only - see LEXICON_COVERED_LANGUAGES below - not a wholesale replacement
of native-language matching.

MODEL: ai4bharat/indictrans2-indic-en-dist-200M (the distilled, smaller
IndicTrans2 checkpoint - the 1B parameter version exists too but is a much
heavier download/inference cost for a first integration). Requires
`transformers` and `torch` - real, heavy dependencies NOT already used
anywhere else in this service (fastembed was deliberately chosen for
semantic_engine.py specifically to avoid a PyTorch dependency - see that
file's docstring). This is why translation is opt-in
(ENABLE_INDIC_TRANSLATION), unlike the semantic engine which is on by
default: it's a genuine deployment-footprint decision, not a free add-on.

HONESTY NOTES:
1. This sandbox cannot download real IndicTrans2 weights (same "no reachable
   model-weight host" situation as speech_engine.py's Whisper provider and
   semantic_engine.py's fastembed model) - real translation quality can only
   be verified on a machine with actual internet access.
2. Every failure mode (transformers/torch not installed, model can't load,
   any exception during translation) degrades to `available=False` - never
   raises, never breaks the assessment pipeline.
3. Not a validated translation benchmark for this domain - victim testimony
   is informal, distress-inflected, and often code-mixed; translation
   quality on that register specifically has not been evaluated here.
4. Exactly like the LLM and semantic engines: any signal derived from the
   translated text is blended via max() in main.py - it can only ever RAISE
   a category score, never suppress a real signal found elsewhere.
"""

from __future__ import annotations

from dataclasses import dataclass

MODEL_NAME = "ai4bharat/indictrans2-indic-en-dist-200M"

# Languages nlp_engine.LEXICON already covers natively (task #118) - see that
# module's docstring. Translation is skipped for these: they already have
# direct keyword coverage, and routing them through a second model would add
# a real failure surface for no coverage gain. ISO 639-1 codes, matching the
# convention speech_engine.py already uses for language_hint/info.language.
LEXICON_COVERED_LANGUAGES = {"en", "hi", "bn", "mr", "te", "ta", "kn", "or"}

# IndicTrans2's own FLORES-style language codes for the languages it supports
# beyond LEXICON_COVERED_LANGUAGES - a starting subset of the 22 scheduled
# languages it claims, not the full list. Extend as real demand appears.
_SUPPORTED_TARGET_LANGUAGES = {
    "pa": "pan_Guru",  # Punjabi
    "gu": "guj_Gujr",  # Gujarati
    "ml": "mal_Mlym",  # Malayalam
    "as": "asm_Beng",  # Assamese
    "ur": "urd_Arab",  # Urdu
    "ne": "npi_Deva",  # Nepali
}


@dataclass
class TranslationResult:
    available: bool
    translated_text: str = ""
    source_language: str = ""
    model: str = MODEL_NAME
    error: str | None = None  # set (available=False) on any failure - never raises


class _ModelUnavailable(Exception):
    pass


# Manual failure-memoization, not @lru_cache - a plain lru_cache does NOT
# cache exceptions, so a failed load (no network/no torch installed) would
# otherwise retry the full load attempt on every single call. Same real bug
# class already found and fixed once in semantic_engine.py - avoided here
# from the start rather than re-discovering it.
_load_attempted = False
_load_result: tuple | None = None  # (tokenizer, model) once successfully loaded
_load_error: str | None = None


def _load_model():
    """Lazy singleton - loaded on first real use, not at import time, so
    importing this module (e.g. for tests) never triggers a model download
    or requires transformers/torch to be installed."""
    global _load_attempted, _load_result, _load_error
    if _load_attempted:
        if _load_error is not None:
            raise _ModelUnavailable(_load_error)
        return _load_result

    _load_attempted = True
    try:
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
    except ImportError as e:
        _load_error = "transformers/torch not installed"
        raise _ModelUnavailable(_load_error) from e
    try:
        tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, trust_remote_code=True)
        model = AutoModelForSeq2SeqLM.from_pretrained(MODEL_NAME, trust_remote_code=True)
        _load_result = (tokenizer, model)
        return _load_result
    except Exception as e:  # noqa: BLE001 - model download/load failure (no network, disk, etc.) must degrade, not raise
        _load_error = f"model load failed: {e}"
        raise _ModelUnavailable(_load_error) from e


def translate_to_english(text: str, language_hint: str | None) -> TranslationResult:
    """Translates `text` to English if `language_hint` names a language
    outside the lexicon's native coverage and IndicTrans2 supports it.
    Returns available=False (never raises) for: empty text, no/unusable
    language hint, a lexicon-covered language (nothing to gain), an
    unsupported language, or any real translation failure."""
    if not text or not text.strip():
        return TranslationResult(available=False, error="empty_text")

    if not language_hint:
        return TranslationResult(available=False, error="no_language_hint")

    lang = language_hint.lower()
    if lang in LEXICON_COVERED_LANGUAGES:
        return TranslationResult(available=False, error="lexicon_already_covers_language")

    flores_code = _SUPPORTED_TARGET_LANGUAGES.get(lang)
    if flores_code is None:
        return TranslationResult(available=False, error=f"unsupported_language:{lang}")

    from app.config import get_settings

    if not get_settings().enable_indic_translation:
        return TranslationResult(available=False, error="disabled_by_config")

    try:
        tokenizer, model = _load_model()
        # IndicTrans2's real preprocessing (sentence splitting, script
        # normalization, the FLORES source-language tag) is normally handled
        # by AI4Bharat's IndicTransToolkit - not vendored here to keep this
        # module's own dependency footprint minimal. A real deployment
        # should use that toolkit's preprocessor instead of the bare
        # tokenizer call below for production-quality output.
        inputs = tokenizer(text, return_tensors="pt", src_lang=flores_code, tgt_lang="eng_Latn")
        generated = model.generate(**inputs)
        translated = tokenizer.batch_decode(generated, skip_special_tokens=True)[0]
    except _ModelUnavailable as e:
        return TranslationResult(available=False, error=str(e))
    except Exception as e:  # noqa: BLE001 - any other translation failure must degrade, never break the pipeline
        return TranslationResult(available=False, error=f"translation_failed: {e}")

    return TranslationResult(available=True, translated_text=translated, source_language=lang)
