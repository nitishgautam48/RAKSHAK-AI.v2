"""Integration tests for the /v1/assess endpoint's speech-to-text wiring.

These don't exercise real Whisper weights (this sandbox's egress policy
blocks the model-weight host - see speech_engine.py) - they verify the
*wiring* is correct using a fake provider standing in for a real one: audio
is actually passed through to the configured STT provider, the resulting
transcript (not the typed narrative) is what downstream engines analyze,
and any transcription failure degrades to the typed narrative instead of
502-ing the whole assessment. That wiring was broken before this change
(audio_bytes was hardcoded to None), which is the actual bug these tests
guard against.
"""

from __future__ import annotations

import base64

import pytest
from fastapi.testclient import TestClient

from app import main
from app.engines.speech_engine import SpeechToTextProvider, TranscriptionResult
from app.engines.semantic_engine import SemanticIndicators
from app.engines.translation_engine import TranslationResult
from app.engines.indic_semantic_engine import IndicSemanticIndicators
from app.mlops import degradation

SERVICE_KEY_HEADERS = {"X-Service-Key": main.settings.service_key}
FAKE_AUDIO = base64.b64encode(b"not-real-audio-bytes-just-a-fixture").decode()


class _FakeWhisperProvider(SpeechToTextProvider):
    """Stands in for LocalWhisperProvider without needing real model weights."""

    def __init__(self, transcript_text: str):
        self._text = transcript_text

    def transcribe(self, audio_bytes, provided_transcript, language_hint) -> TranscriptionResult:
        assert audio_bytes is not None, "real audio bytes must reach the provider"
        return TranscriptionResult(transcript=self._text, language_detected="hi", confidence=88.0, source="whisper_local")


class _FailingProvider(SpeechToTextProvider):
    def transcribe(self, audio_bytes, provided_transcript, language_hint) -> TranscriptionResult:
        raise RuntimeError("simulated ASR failure (e.g. missing model weights)")


@pytest.fixture
def client():
    return TestClient(main.app)


@pytest.fixture(autouse=True)
def _isolate_degradation_log(monkeypatch, tmp_path):
    # Several tests in this file deliberately trigger STT/voice-DSP
    # failures to test fallback behavior - without this, those real
    # degrade() calls would write into this machine's actual
    # data/degradation_events.jsonl, polluting real observability data with
    # test noise. Autouse so no test can forget it (a real bug found after
    # adding task #123's logging: the pre-existing failure-path tests below
    # had exactly this leak until this fixture was added).
    monkeypatch.setattr(degradation, "_log_path", lambda: tmp_path / "degradation_events.jsonl")
    # This file tests STT/voice-DSP wiring, not the semantic engine (see
    # test_semantic_engine.py for that) - the real semantic engine tries to
    # download its model on every call, which both fails in this sandbox
    # (no network - see semantic_engine.py's docstring) and would make these
    # tests depend on real network conditions/speed. Stubbed to a clean
    # "unavailable, no error" result so it never contributes noise here.
    monkeypatch.setattr(main.semantic_engine, "analyze", lambda text: SemanticIndicators(available=False, error=None))
    # Same reasoning as the semantic-engine stub above, for the new
    # translation engine (test_translation_engine.py owns real coverage of
    # its routing/degradation behavior) - most tests here don't set a
    # non-lexicon language_hint anyway, so this would already no-op, but
    # stubbed explicitly so this file's intent stays self-documenting.
    monkeypatch.setattr(main.translation_engine, "translate_to_english", lambda text, language_hint: TranslationResult(available=False, error=None))
    # Same reasoning again, for indic_semantic_engine.py (its own dedicated
    # test file owns real coverage of its routing/degradation behavior).
    monkeypatch.setattr(main.indic_semantic_engine, "analyze", lambda text, language_hint: IndicSemanticIndicators(available=False, error=None))


def test_default_provider_ignores_audio_and_uses_typed_narrative(client, monkeypatch):
    # Regression guard: with the default "operator_transcript" provider (no
    # STT configured), behavior must be unchanged from before this feature -
    # audio is accepted but not transcribed, and analysis runs on the typed
    # narrative.
    monkeypatch.setattr(main.settings, "stt_provider", "operator_transcript")
    resp = client.post(
        "/v1/assess",
        json={"narrative": "They threatened to kill us.", "audio_base64": FAKE_AUDIO},
        headers=SERVICE_KEY_HEADERS,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["transcript"]["source"] == "operator_transcript"
    assert body["transcript"]["transcript"] == "They threatened to kill us."
    assert body["nlp"]["threatScore"] > 0


def test_whisper_provider_transcribes_real_audio_and_that_drives_scoring(client, monkeypatch):
    # This is the actual gap task #119 closes: a voice-only complaint's
    # typed narrative is just a placeholder with zero signal, but the real
    # spoken content (here, standing in for what Whisper would produce)
    # should be what's analyzed and what reaches the dashboard.
    monkeypatch.setattr(main.settings, "stt_provider", "whisper_local")
    monkeypatch.setattr(
        main.speech_engine, "get_provider",
        lambda name: _FakeWhisperProvider("They threatened to kill us and burn our house.") if name == "whisper_local"
        else main.speech_engine.OperatorTranscriptProvider(),
    )
    resp = client.post(
        "/v1/assess",
        json={
            "narrative": "[Voice message submitted - no typed narrative. See attached audio recording.]",
            "audio_base64": FAKE_AUDIO,
        },
        headers=SERVICE_KEY_HEADERS,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["transcript"]["source"] == "whisper_local"
    assert body["transcript"]["transcript"] == "They threatened to kill us and burn our house."
    # The placeholder narrative has no threat keywords; the real transcript does.
    assert body["nlp"]["threatScore"] > 0
    assert "kill" in body["nlp"]["matchedKeywords"]


def test_whisper_failure_falls_back_to_typed_narrative_instead_of_erroring(client, monkeypatch):
    monkeypatch.setattr(main.settings, "stt_provider", "whisper_local")
    monkeypatch.setattr(
        main.speech_engine, "get_provider",
        lambda name: _FailingProvider() if name == "whisper_local" else main.speech_engine.OperatorTranscriptProvider(),
    )
    resp = client.post(
        "/v1/assess",
        json={"narrative": "They threatened to kill us.", "audio_base64": FAKE_AUDIO},
        headers=SERVICE_KEY_HEADERS,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["transcript"]["source"] == "operator_transcript"
    assert body["nlp"]["threatScore"] > 0


def test_whisper_failure_is_logged_as_a_degradation_event(client, monkeypatch):
    # Task #123: a real STT failure used to be entirely silent (fall back
    # and move on) - it must now leave a real, countable trace so an admin
    # can tell "Whisper is failing on real traffic" from "STT isn't
    # configured."
    monkeypatch.setattr(main.settings, "stt_provider", "whisper_local")
    monkeypatch.setattr(
        main.speech_engine, "get_provider",
        lambda name: _FailingProvider() if name == "whisper_local" else main.speech_engine.OperatorTranscriptProvider(),
    )
    client.post(
        "/v1/assess",
        json={"narrative": "They threatened to kill us.", "audio_base64": FAKE_AUDIO},
        headers=SERVICE_KEY_HEADERS,
    )
    summary = degradation.get_degradation_summary()
    assert summary["byEngine"].get("stt") == 1


def test_voice_dsp_failure_is_logged_as_a_degradation_event(client):
    # FAKE_AUDIO isn't real audio, so voice_engine.analyze will fail on it -
    # the default operator_transcript provider means STT isn't touched.
    client.post(
        "/v1/assess",
        json={"narrative": "They threatened to kill us.", "audio_base64": FAKE_AUDIO},
        headers=SERVICE_KEY_HEADERS,
    )
    summary = degradation.get_degradation_summary()
    assert summary["byEngine"].get("voice_dsp") == 1


def test_no_failures_means_no_degradation_events_logged(client):
    # Regression guard the other direction: a totally clean run (no audio at
    # all, so nothing can fail) must not spuriously log anything.
    client.post(
        "/v1/assess",
        json={"narrative": "They threatened to kill us."},
        headers=SERVICE_KEY_HEADERS,
    )
    summary = degradation.get_degradation_summary()
    assert summary["totalEvents"] == 0


def test_no_audio_never_calls_the_stt_provider_with_audio(client, monkeypatch):
    monkeypatch.setattr(main.settings, "stt_provider", "whisper_local")

    def _get_provider(name):
        if name == "whisper_local":
            raise AssertionError("whisper provider should not be invoked when there is no audio")
        return main.speech_engine.OperatorTranscriptProvider()

    monkeypatch.setattr(main.speech_engine, "get_provider", _get_provider)
    resp = client.post(
        "/v1/assess",
        json={"narrative": "They threatened to kill us."},
        headers=SERVICE_KEY_HEADERS,
    )
    assert resp.status_code == 200
    assert resp.json()["transcript"]["source"] == "operator_transcript"
