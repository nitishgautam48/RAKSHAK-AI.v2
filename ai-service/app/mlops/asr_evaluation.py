"""ASR (speech-to-text) accuracy evaluation via Mozilla Common Voice.

WHY THIS EXISTS: neither evaluation.py (NLP/SVI) nor voice_evaluation.py
(acoustic DSP) measures speech-to-text ACCURACY at all - there was no
word-error-rate (WER) metric anywhere in this codebase before this module,
despite two real STT providers (LocalWhisperProvider, IndicConformerProvider
in engines/speech_engine.py) existing. This closes that gap using Mozilla
Common Voice (https://commonvoice.mozilla.org) - a real, permissively-
licensed, crowd-sourced speech corpus with actual audio+transcript pairs
across 100+ languages, including several of nlp_engine.LEXICON's covered
languages - rather than a synthetic or fabricated benchmark.

HONESTY NOTES:
1. This sandbox has neither a downloaded Common Voice dataset nor network
   access to fetch one (same situation as every other real-model/dataset
   engine in this codebase). `word_error_rate()` itself is pure math, fully
   testable here with synthetic string pairs - but real WER numbers against
   real audio can only be produced on a machine with an actual downloaded
   Common Voice language subset.
2. To use this for real: download a Common Voice release for your target
   language from https://commonvoice.mozilla.org/en/datasets, unpack it,
   then either call evaluate_against_common_voice() directly or run this
   module's CLI (see the bottom of this file) pointing at its
   validated.tsv (or test.tsv) and the accompanying clips/ folder.
3. WER here is the standard word-level definition used throughout the ASR
   literature - (substitutions + deletions + insertions) / reference word
   count, via dynamic-programming edit distance over word tokens - not a
   custom or looser approximation.
4. One clip failing to transcribe (corrupt audio, provider error) is
   recorded as that utterance's own error (WER counted as 1.0, worst case)
   rather than aborting the whole evaluation run - a bad clip in a
   real-world dataset shouldn't silently throw away every other result.
"""

from __future__ import annotations

import csv
from dataclasses import dataclass, field
from pathlib import Path


def word_error_rate(reference: str, hypothesis: str) -> float:
    """Standard word-level WER via dynamic-programming edit distance over
    word tokens. Edge cases handled explicitly rather than dividing by
    zero: an empty reference with an empty hypothesis is a perfect (0.0)
    match; an empty reference with a non-empty hypothesis is entirely
    inserted words (1.0, capped rather than undefined)."""
    ref_words = reference.split()
    hyp_words = hypothesis.split()

    if not ref_words:
        return 0.0 if not hyp_words else 1.0

    n, m = len(ref_words), len(hyp_words)
    dp = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n + 1):
        dp[i][0] = i
    for j in range(m + 1):
        dp[0][j] = j
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            if ref_words[i - 1] == hyp_words[j - 1]:
                dp[i][j] = dp[i - 1][j - 1]
            else:
                dp[i][j] = 1 + min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])

    return dp[n][m] / n


@dataclass
class UtteranceResult:
    clip_path: str
    reference: str
    hypothesis: str
    wer: float
    error: str | None = None  # set if transcription itself failed for this utterance


@dataclass
class ASREvaluationSummary:
    available: bool
    provider_name: str = ""
    total_utterances: int = 0
    average_wer: float = 0.0
    utterances: list[UtteranceResult] = field(default_factory=list)
    error: str | None = None


def load_common_voice_tsv(tsv_path: str | Path) -> list[dict]:
    """Parses a real Common Voice validated.tsv/test.tsv - tab-separated,
    with (at minimum) 'path' and 'sentence' columns per Mozilla's published
    format. Raises FileNotFoundError/ValueError with a clear message rather
    than a cryptic csv-module error if the file is missing or malformed."""
    path = Path(tsv_path)
    if not path.exists():
        raise FileNotFoundError(f"Common Voice TSV not found: {path}")
    with path.open(encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter="\t")
        if reader.fieldnames is None or "path" not in reader.fieldnames or "sentence" not in reader.fieldnames:
            raise ValueError(f"{path} does not look like a Common Voice TSV (expected 'path' and 'sentence' columns, got {reader.fieldnames})")
        return list(reader)


def evaluate_against_common_voice(
    tsv_path: str | Path,
    clips_dir: str | Path,
    provider_name: str,
    max_utterances: int | None = None,
) -> ASREvaluationSummary:
    """Runs a configured STT provider (see engines/speech_engine.py) against
    real Common Voice audio+transcript pairs and reports word error rate.
    Degrades to available=False on any setup failure (bad TSV, missing
    clips directory, provider construction failure e.g. missing model
    weights) - never raises out to a caller expecting a clean summary."""
    from app.engines import speech_engine

    try:
        rows = load_common_voice_tsv(tsv_path)
    except (FileNotFoundError, ValueError) as e:
        return ASREvaluationSummary(available=False, error=str(e))

    if max_utterances is not None:
        rows = rows[:max_utterances]

    clips_path = Path(clips_dir)
    if not clips_path.is_dir():
        return ASREvaluationSummary(available=False, error=f"clips directory not found: {clips_path}")

    try:
        provider = speech_engine.get_provider(provider_name)
    except Exception as e:  # noqa: BLE001 - provider construction failure (missing weights/deps) must degrade, not raise
        return ASREvaluationSummary(available=False, error=f"provider unavailable: {e}")

    results: list[UtteranceResult] = []
    for row in rows:
        clip_file = clips_path / row["path"]
        reference = row["sentence"]
        try:
            audio_bytes = clip_file.read_bytes()
            transcription = provider.transcribe(audio_bytes=audio_bytes, provided_transcript=None, language_hint=None)
            wer = word_error_rate(reference, transcription.transcript)
            results.append(UtteranceResult(clip_path=str(clip_file), reference=reference, hypothesis=transcription.transcript, wer=round(wer, 4)))
        except Exception as e:  # noqa: BLE001 - one bad clip must not abort the whole evaluation run
            results.append(UtteranceResult(clip_path=str(clip_file), reference=reference, hypothesis="", wer=1.0, error=str(e)))

    average_wer = sum(r.wer for r in results) / len(results) if results else 0.0
    return ASREvaluationSummary(
        available=True,
        provider_name=provider_name,
        total_utterances=len(results),
        average_wer=round(average_wer, 4),
        utterances=results,
    )


if __name__ == "__main__":
    # Real, runnable CLI - not exercisable in this sandbox (no Common Voice
    # data or network access here), but this is exactly what you'd run on
    # your own machine after downloading a Common Voice language subset:
    #   uv run python -m app.mlops.asr_evaluation \
    #     --tsv /path/to/cv-corpus/hi/validated.tsv \
    #     --clips-dir /path/to/cv-corpus/hi/clips \
    #     --provider whisper_local --max-utterances 50
    import argparse
    import json
    from dataclasses import asdict

    parser = argparse.ArgumentParser(description="Evaluate an STT provider's real word-error-rate against a downloaded Mozilla Common Voice dataset.")
    parser.add_argument("--tsv", required=True, help="Path to Common Voice validated.tsv or test.tsv")
    parser.add_argument("--clips-dir", required=True, help="Path to the accompanying clips/ folder")
    parser.add_argument("--provider", default="whisper_local", help="STT provider name: whisper_local | indic_conformer")
    parser.add_argument("--max-utterances", type=int, default=None, help="Limit how many utterances to evaluate (omit for the full set)")
    args = parser.parse_args()

    summary = evaluate_against_common_voice(args.tsv, args.clips_dir, args.provider, args.max_utterances)
    print(json.dumps(asdict(summary), indent=2, ensure_ascii=False))
