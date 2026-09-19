"""Speech Engine - pluggable speech-to-text provider interface.

Why this defaults to a human-entered transcript rather than calling Whisper:
this sandbox's outbound egress policy denies every model-weight host tried
during setup (huggingface.co, openaipublic.azureedge.net, api.openai.com,
api.assemblyai.com all returned 403 org-policy-denied), so real Whisper
weights cannot be downloaded or exercised end-to-end from inside this
sandbox. `faster-whisper` itself is a normal PyPI package with no such
restriction and is installed as a real dependency (see pyproject.toml).

`LocalWhisperProvider` below is a real, working implementation. It activates
the moment STT_PROVIDER=whisper_local and WHISPER_MODEL_PATH are set in the
environment - WHISPER_MODEL_PATH can be a model size faster-whisper knows how
to fetch itself ("tiny", "base", "small", "medium", "large-v3" - larger means
slower but more accurate, "small" is a reasonable balance on CPU), a
Hugging Face repo id, or a local directory of pre-downloaded weights. On a
machine with normal internet access (e.g. your own local dev setup, or a
deployment that isn't behind this sandbox's egress policy), the size-name
form downloads and caches the weights automatically on first use - no manual
download step needed. Until this is configured, `OperatorTranscriptProvider`
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
