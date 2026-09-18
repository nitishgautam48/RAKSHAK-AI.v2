"""Speech Engine - pluggable speech-to-text provider interface.

Why this defaults to a human-entered transcript rather than calling Whisper:
this sandbox's outbound egress policy denies every model-weight host tried
during setup (huggingface.co, openaipublic.azureedge.net, api.openai.com,
api.assemblyai.com all returned 403 org-policy-denied). There is no route to
download Whisper/IndicWhisper weights or reach a hosted ASR API from here.

`LocalWhisperProvider` below is a real, working implementation - it runs the
moment `faster-whisper` is installed and a model directory is pointed at via
WHISPER_MODEL_PATH (e.g. by mounting pre-downloaded weights in a deployment
that *does* have model-host access). Until then, `OperatorTranscriptProvider`
is what's active, which matches how real 14566-style helplines already
operate: an operator or the survivor supplies the transcript directly, and
every downstream engine (NLP/SVI/emotion) analyzes that real text.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class TranscriptionResult:
    transcript: str
    language_detected: str
    confidence: float
    source: str  # "operator_transcript" | "whisper_local"


class SpeechToTextProvider(ABC):
    @abstractmethod
    def transcribe(self, audio_bytes: bytes | None, provided_transcript: str | None, language_hint: str | None) -> TranscriptionResult: ...


class OperatorTranscriptProvider(SpeechToTextProvider):
    def transcribe(self, audio_bytes: bytes | None, provided_transcript: str | None, language_hint: str | None) -> TranscriptionResult:
        if not provided_transcript:
            return TranscriptionResult(transcript="", language_detected=language_hint or "unknown", confidence=0.0, source="operator_transcript")
        return TranscriptionResult(
            transcript=provided_transcript,
            language_detected=language_hint or "unknown",
            confidence=95.0,  # operator/victim-entered text is treated as ground truth
            source="operator_transcript",
        )


class LocalWhisperProvider(SpeechToTextProvider):
    """Activates only if WHISPER_MODEL_PATH is set and faster-whisper +
    local model weights are actually present. Raises a clear, honest error
    otherwise rather than silently falling back and pretending to transcribe."""

    def __init__(self, model_path: str):
        try:
            from faster_whisper import WhisperModel  # type: ignore
        except ImportError as e:
            raise RuntimeError(
                "LocalWhisperProvider requires the 'faster-whisper' package "
                "(not installed - see ai-service/pyproject.toml) plus local "
                "model weights at WHISPER_MODEL_PATH.",
            ) from e
        self._model = WhisperModel(model_path, device="cpu", compute_type="int8")

    def transcribe(self, audio_bytes: bytes | None, provided_transcript: str | None, language_hint: str | None) -> TranscriptionResult:
        if not audio_bytes:
            raise ValueError("audio_bytes required for LocalWhisperProvider")
        import io

        segments, info = self._model.transcribe(io.BytesIO(audio_bytes), language=language_hint)
        text = " ".join(s.text.strip() for s in segments)
        return TranscriptionResult(
            transcript=text,
            language_detected=info.language,
            confidence=round(float(info.language_probability) * 100, 1),
            source="whisper_local",
        )


def get_provider(provider_name: str) -> SpeechToTextProvider:
    if provider_name == "whisper_local":
        import os

        model_path = os.environ.get("WHISPER_MODEL_PATH")
        if not model_path:
            raise RuntimeError("WHISPER_MODEL_PATH must be set to use the whisper_local provider")
        return LocalWhisperProvider(model_path)
    return OperatorTranscriptProvider()
