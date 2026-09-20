"""Tests for speech_engine.py's IndicConformerProvider and get_provider()
registration.

Same approach as the other real-model engines in this codebase: no real
nemo_toolkit install here (a very heavy dependency, not installed in this
sandbox - see IndicConformerProvider's docstring) - these verify the
provider-selection logic, the required-env-var error handling, and the
transcribe() wiring (wav-bytes-to-tempfile, both plain-string and
Hypothesis-object NeMo return shapes) using a fake nemo module.
"""

from __future__ import annotations

import sys
import types

import pytest

from app.engines import speech_engine


def test_get_provider_defaults_to_operator_transcript_for_unknown_name():
    provider = speech_engine.get_provider("something_unrecognized")
    assert isinstance(provider, speech_engine.OperatorTranscriptProvider)


def test_get_provider_indic_conformer_requires_model_name_env_var(monkeypatch):
    monkeypatch.delenv("INDIC_CONFORMER_MODEL_NAME", raising=False)
    with pytest.raises(RuntimeError, match="INDIC_CONFORMER_MODEL_NAME"):
        speech_engine.get_provider("indic_conformer")


def test_indic_conformer_provider_raises_clearly_when_nemo_not_installed(monkeypatch):
    monkeypatch.delitem(sys.modules, "nemo.collections.asr", raising=False)
    monkeypatch.delitem(sys.modules, "nemo", raising=False)
    with pytest.raises(RuntimeError, match="nemo_toolkit"):
        speech_engine.IndicConformerProvider("some/model-name", "hi")


def _install_fake_nemo(monkeypatch, transcribe_return):
    class _FakeASRModel:
        @staticmethod
        def from_pretrained(model_name):
            return _FakeModelInstance()

    class _FakeModelInstance:
        def transcribe(self, audio):
            assert isinstance(audio, list) and len(audio) == 1
            return transcribe_return

    fake_models_module = types.SimpleNamespace(ASRModel=_FakeASRModel)
    fake_asr_module = types.ModuleType("nemo.collections.asr")
    fake_asr_module.models = fake_models_module
    fake_nemo_module = types.ModuleType("nemo")
    fake_collections_module = types.ModuleType("nemo.collections")

    monkeypatch.setitem(sys.modules, "nemo", fake_nemo_module)
    monkeypatch.setitem(sys.modules, "nemo.collections", fake_collections_module)
    monkeypatch.setitem(sys.modules, "nemo.collections.asr", fake_asr_module)


def test_indic_conformer_transcribe_handles_plain_string_result(monkeypatch):
    _install_fake_nemo(monkeypatch, transcribe_return=["mujhe madad chahiye"])
    provider = speech_engine.IndicConformerProvider("fake/model", "hi")
    result = provider.transcribe(audio_bytes=b"fake-wav-bytes", provided_transcript=None, language_hint="hi")
    assert result.transcript == "mujhe madad chahiye"
    assert result.language_detected == "hi"
    assert result.source == "indic_conformer"


def test_indic_conformer_transcribe_handles_hypothesis_object_result(monkeypatch):
    class _FakeHypothesis:
        text = "mujhe madad chahiye"

    _install_fake_nemo(monkeypatch, transcribe_return=[_FakeHypothesis()])
    provider = speech_engine.IndicConformerProvider("fake/model", "hi")
    result = provider.transcribe(audio_bytes=b"fake-wav-bytes", provided_transcript=None, language_hint="hi")
    assert result.transcript == "mujhe madad chahiye"


def test_indic_conformer_transcribe_requires_audio_bytes(monkeypatch):
    _install_fake_nemo(monkeypatch, transcribe_return=[""])
    provider = speech_engine.IndicConformerProvider("fake/model", "hi")
    with pytest.raises(ValueError):
        provider.transcribe(audio_bytes=None, provided_transcript=None, language_hint="hi")


def test_get_provider_indic_conformer_uses_env_vars(monkeypatch):
    _install_fake_nemo(monkeypatch, transcribe_return=["ok"])
    monkeypatch.setenv("INDIC_CONFORMER_MODEL_NAME", "ai4bharat/some-model")
    monkeypatch.setenv("INDIC_CONFORMER_LANGUAGE", "ta")
    provider = speech_engine.get_provider("indic_conformer")
    assert isinstance(provider, speech_engine.IndicConformerProvider)
    result = provider.transcribe(audio_bytes=b"fake", provided_transcript=None, language_hint="ta")
    assert result.language_detected == "ta"
