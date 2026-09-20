"""Tests for asr_evaluation.py.

word_error_rate() is pure math - tested directly with real string pairs
whose correct WER is known by hand-calculation. The Common Voice loader and
evaluator are tested against a tiny fixture TSV/clips directory this test
creates itself (no real Common Voice download needed), using a fake STT
provider standing in for whisper_local/indic_conformer - exactly the same
"fakes, not real model weights" approach as every other real-model engine's
test suite in this codebase.
"""

from __future__ import annotations

from app.mlops import asr_evaluation


def test_wer_identical_sentences_is_zero():
    assert asr_evaluation.word_error_rate("they threatened to kill us", "they threatened to kill us") == 0.0


def test_wer_one_substitution_in_five_words():
    # "kill" -> "hurt" is 1 substitution out of 5 reference words.
    assert asr_evaluation.word_error_rate("they threatened to kill us", "they threatened to hurt us") == 0.2


def test_wer_one_insertion():
    # hypothesis has one extra word beyond the 3-word reference.
    assert abs(asr_evaluation.word_error_rate("a b c", "a b c d") - 1 / 3) < 1e-9


def test_wer_one_deletion():
    # hypothesis is missing one word from the 3-word reference.
    assert abs(asr_evaluation.word_error_rate("a b c", "a b") - 1 / 3) < 1e-9


def test_wer_completely_different_three_word_sentences_is_one():
    assert asr_evaluation.word_error_rate("a b c", "x y z") == 1.0


def test_wer_empty_reference_and_empty_hypothesis_is_zero():
    assert asr_evaluation.word_error_rate("", "") == 0.0


def test_wer_empty_reference_with_nonempty_hypothesis_is_one():
    assert asr_evaluation.word_error_rate("", "some words here") == 1.0


def test_load_common_voice_tsv_parses_real_format(tmp_path):
    tsv = tmp_path / "validated.tsv"
    tsv.write_text("client_id\tpath\tsentence\tup_votes\n" "abc123\tclip1.mp3\tthey threatened to kill us\t2\n", encoding="utf-8")
    rows = asr_evaluation.load_common_voice_tsv(tsv)
    assert len(rows) == 1
    assert rows[0]["path"] == "clip1.mp3"
    assert rows[0]["sentence"] == "they threatened to kill us"


def test_load_common_voice_tsv_missing_file_raises_clear_error(tmp_path):
    import pytest

    with pytest.raises(FileNotFoundError, match="not found"):
        asr_evaluation.load_common_voice_tsv(tmp_path / "does_not_exist.tsv")


def test_load_common_voice_tsv_missing_columns_raises_clear_error(tmp_path):
    import pytest

    tsv = tmp_path / "bad.tsv"
    tsv.write_text("foo\tbar\n1\t2\n", encoding="utf-8")
    with pytest.raises(ValueError, match="does not look like a Common Voice TSV"):
        asr_evaluation.load_common_voice_tsv(tsv)


class _FixedResponseProvider:
    """Stands in for LocalWhisperProvider/IndicConformerProvider - always
    returns the same hypothesis, for tests that only care about counts
    (e.g. max_utterances) rather than per-clip WER values."""

    def transcribe(self, audio_bytes, provided_transcript, language_hint):
        from app.engines.speech_engine import TranscriptionResult

        return TranscriptionResult(transcript="they threatened to kill us", language_detected="en", confidence=90.0, source="whisper_local")


def _make_fixture_dataset(tmp_path):
    clips_dir = tmp_path / "clips"
    clips_dir.mkdir()
    (clips_dir / "clip1.mp3").write_bytes(b"fake-audio-1")
    (clips_dir / "clip2.mp3").write_bytes(b"fake-audio-2")

    tsv = tmp_path / "validated.tsv"
    tsv.write_text(
        "client_id\tpath\tsentence\tup_votes\n"
        "a\tclip1.mp3\tthey threatened to kill us\t2\n"
        "b\tclip2.mp3\tthey threatened to kill us\t2\n",
        encoding="utf-8",
    )
    return tsv, clips_dir


def test_evaluate_against_common_voice_full_flow(monkeypatch, tmp_path):
    tsv, clips_dir = _make_fixture_dataset(tmp_path)

    class _PerClipProvider:
        def transcribe(self, audio_bytes, provided_transcript, language_hint):
            from app.engines.speech_engine import TranscriptionResult

            # Distinguish clips by their fixture byte content.
            text = "they threatened to kill us" if audio_bytes == b"fake-audio-1" else "they threatened to hurt us"
            return TranscriptionResult(transcript=text, language_detected="en", confidence=90.0, source="whisper_local")

    from app.engines import speech_engine

    monkeypatch.setattr(speech_engine, "get_provider", lambda name: _PerClipProvider())

    summary = asr_evaluation.evaluate_against_common_voice(tsv, clips_dir, "whisper_local")
    assert summary.available is True
    assert summary.total_utterances == 2
    assert summary.utterances[0].wer == 0.0
    assert summary.utterances[1].wer == 0.2
    assert abs(summary.average_wer - 0.1) < 1e-9


def test_evaluate_against_common_voice_respects_max_utterances(monkeypatch, tmp_path):
    tsv, clips_dir = _make_fixture_dataset(tmp_path)
    from app.engines import speech_engine

    monkeypatch.setattr(speech_engine, "get_provider", lambda name: _FixedResponseProvider())

    summary = asr_evaluation.evaluate_against_common_voice(tsv, clips_dir, "whisper_local", max_utterances=1)
    assert summary.total_utterances == 1


def test_evaluate_against_common_voice_missing_clips_dir_degrades_gracefully(monkeypatch, tmp_path):
    tsv, _ = _make_fixture_dataset(tmp_path)
    summary = asr_evaluation.evaluate_against_common_voice(tsv, tmp_path / "nonexistent_clips", "whisper_local")
    assert summary.available is False
    assert "clips directory not found" in summary.error


def test_evaluate_against_common_voice_provider_unavailable_degrades_gracefully(monkeypatch, tmp_path):
    tsv, clips_dir = _make_fixture_dataset(tmp_path)
    from app.engines import speech_engine

    def _raise(name):
        raise RuntimeError("WHISPER_MODEL_PATH must be set to use the whisper_local provider")

    monkeypatch.setattr(speech_engine, "get_provider", _raise)

    summary = asr_evaluation.evaluate_against_common_voice(tsv, clips_dir, "whisper_local")
    assert summary.available is False
    assert "provider unavailable" in summary.error


def test_evaluate_against_common_voice_bad_tsv_degrades_gracefully(tmp_path):
    summary = asr_evaluation.evaluate_against_common_voice(tmp_path / "missing.tsv", tmp_path, "whisper_local")
    assert summary.available is False
    assert "not found" in summary.error


def test_evaluate_against_common_voice_one_bad_clip_does_not_abort_the_run(monkeypatch, tmp_path):
    tsv, clips_dir = _make_fixture_dataset(tmp_path)
    (clips_dir / "clip1.mp3").unlink()  # simulate a missing/corrupt clip file

    from app.engines import speech_engine

    class _WorkingProvider:
        def transcribe(self, audio_bytes, provided_transcript, language_hint):
            from app.engines.speech_engine import TranscriptionResult

            return TranscriptionResult(transcript="they threatened to kill us", language_detected="en", confidence=90.0, source="whisper_local")

    monkeypatch.setattr(speech_engine, "get_provider", lambda name: _WorkingProvider())

    summary = asr_evaluation.evaluate_against_common_voice(tsv, clips_dir, "whisper_local")
    assert summary.available is True
    assert summary.total_utterances == 2
    assert summary.utterances[0].error is not None  # clip1.mp3 missing
    assert summary.utterances[0].wer == 1.0
    assert summary.utterances[1].error is None  # clip2.mp3 still transcribed fine
    assert summary.utterances[1].wer == 0.0
