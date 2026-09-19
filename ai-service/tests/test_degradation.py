"""Tests for the degradation-event observability log.

Isolated from the real data/ directory via monkeypatching _log_path, so
these never read or write the actual deployment's degradation_events.jsonl.
"""

from __future__ import annotations

from app.mlops import degradation


def _use_tmp_log(monkeypatch, tmp_path):
    log_path = tmp_path / "degradation_events.jsonl"
    monkeypatch.setattr(degradation, "_log_path", lambda: log_path)
    return log_path


def test_summary_is_empty_before_anything_is_logged(monkeypatch, tmp_path):
    _use_tmp_log(monkeypatch, tmp_path)
    summary = degradation.get_degradation_summary()
    assert summary["totalEvents"] == 0
    assert summary["byEngine"] == {}


def test_logged_events_are_counted_by_engine_and_reason(monkeypatch, tmp_path):
    _use_tmp_log(monkeypatch, tmp_path)
    degradation.log_degradation("stt", "whisper_local_transcription_failed")
    degradation.log_degradation("stt", "whisper_local_transcription_failed")
    degradation.log_degradation("voice_dsp", "voice_analysis_failed")

    summary = degradation.get_degradation_summary()
    assert summary["totalEvents"] == 3
    assert summary["byEngine"] == {"stt": 2, "voice_dsp": 1}
    assert summary["byEngineReason"]["stt:whisper_local_transcription_failed"] == 2
    assert summary["byEngineReason"]["voice_dsp:voice_analysis_failed"] == 1


def test_recent_window_excludes_old_events(monkeypatch, tmp_path):
    log_path = _use_tmp_log(monkeypatch, tmp_path)
    import json
    import time

    old_event = {"engine": "llm", "reason": "api_error", "ts": int(time.time()) - 999999}
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_path.write_text(json.dumps(old_event) + "\n")
    degradation.log_degradation("llm", "api_error")

    summary = degradation.get_degradation_summary(recent_window_seconds=3600)
    assert summary["totalEvents"] == 2
    assert summary["recentEvents"] == 1
    assert summary["recentByEngine"] == {"llm": 1}
