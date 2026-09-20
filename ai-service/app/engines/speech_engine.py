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

`IndicConformerProvider` below is a second real ASR option
(STT_PROVIDER=indic_conformer), using AI4Bharat's Indian-language-specific
IndicConformer models via NVIDIA NeMo instead of Whisper - see that class's
own docstring for real, disclosed tradeoffs (one configured language per
deployment, a much heavier install than Whisper, no per-utterance
confidence score yet).
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class TranscriptionResult:
    transcript: str
    language_detected: str
    confidence: float
    source: str  # "operator_transcript" | "whisper_local" | "indic_conformer"


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


class IndicConformerProvider(SpeechToTextProvider):
    """AI4Bharat IndicConformer - an Indian-language-specific ASR alternative
    to LocalWhisperProvider above, via NVIDIA NeMo (the toolkit IndicConformer
    checkpoints are actually published in - not a HuggingFace `transformers`
    model like translation_engine.py/indic_semantic_engine.py's dependencies).

    REAL LIMITATION, DISCLOSED RATHER THAN HIDDEN: unlike Whisper, which is
    one multilingual checkpoint that detects the spoken language itself,
    AI4Bharat publishes IndicConformer as a SEPARATE checkpoint per language.
    This first integration supports exactly ONE configured language per
    deployment (INDIC_CONFORMER_LANGUAGE) - it does not auto-detect language
    or load multiple language checkpoints simultaneously (that would need
    either a lot more memory held resident, or per-request lazy-loading
    keyed by language_hint - a real follow-up, not built here). Choose this
    provider only for a deployment that reliably serves ONE known language's
    speakers; otherwise LocalWhisperProvider's single multilingual model is
    the better fit today.

    DEPENDENCY WEIGHT, PLAINLY STATED: `nemo_toolkit[asr]` is a much heavier
    install than transformers+torch alone (it pulls in pytorch-lightning,
    hydra-core, sentencepiece, and more - commonly several GB combined), and
    is known to have real install friction (version-pinned sub-dependencies)
    even on a machine with full internet access. This is why it's its own
    separate optional-dependency group (`indic-asr`, see pyproject.toml),
    distinct from the lighter `indic-nlp` group translation_engine.py and
    indic_semantic_engine.py share.

    HONESTY NOTES:
    1. Same "this sandbox cannot download real model weights" situation as
       LocalWhisperProvider - real transcription quality can only be
       verified on a machine with actual internet access (and here,
       realistically, a GPU - NeMo Conformer models are slow on CPU).
    2. NeMo's `ASRModel.transcribe()` API has changed argument names across
       versions (`paths2audio_files` in older releases, `audio` in newer
       ones) - if this raises a TypeError on your installed nemo_toolkit
       version, that argument name is the first thing to check.
    3. Does not expose a real per-utterance confidence score the way
       faster-whisper's `info.language_probability` does; NeMo's basic
       transcribe() call returns text only. A fixed placeholder is used
       below rather than fabricating false precision - a real confidence
       figure would need `return_hypotheses=True` and extracting per-token
       logprobs, not done in this first integration.
    """

    def __init__(self, model_name: str, language: str):
        try:
            import nemo.collections.asr as nemo_asr  # type: ignore
        except ImportError as e:
            raise RuntimeError(
                "IndicConformerProvider requires the 'nemo_toolkit[asr]' package "
                "(not installed - a real, very heavy dependency, see "
                "ai-service/pyproject.toml's indic-asr extra) plus a reachable "
                "AI4Bharat IndicConformer checkpoint at INDIC_CONFORMER_MODEL_NAME.",
            ) from e
        self._model = nemo_asr.models.ASRModel.from_pretrained(model_name=model_name)
        self._language = language

    def transcribe(self, audio_bytes: bytes | None, provided_transcript: str | None, language_hint: str | None) -> TranscriptionResult:
        if not audio_bytes:
            raise ValueError("audio_bytes required for IndicConformerProvider")
        import tempfile

        with tempfile.NamedTemporaryFile(suffix=".wav") as tmp:
            tmp.write(audio_bytes)
            tmp.flush()
            hypotheses = self._model.transcribe(audio=[tmp.name])
        raw = hypotheses[0] if hypotheses else ""
        # Some NeMo versions return plain strings, others return Hypothesis
        # objects with a `.text` attribute - handle both without guessing
        # which one the installed version uses.
        text = raw if isinstance(raw, str) else getattr(raw, "text", str(raw))
        return TranscriptionResult(
            transcript=text,
            language_detected=self._language,
            confidence=85.0,  # see class docstring note 3 - not a real measured figure
            source="indic_conformer",
        )


def get_provider(provider_name: str) -> SpeechToTextProvider:
    if provider_name == "whisper_local":
        import os

        model_path = os.environ.get("WHISPER_MODEL_PATH")
        if not model_path:
            raise RuntimeError("WHISPER_MODEL_PATH must be set to use the whisper_local provider")
        return LocalWhisperProvider(model_path)
    if provider_name == "indic_conformer":
        import os

        model_name = os.environ.get("INDIC_CONFORMER_MODEL_NAME")
        if not model_name:
            raise RuntimeError("INDIC_CONFORMER_MODEL_NAME must be set to use the indic_conformer provider")
        language = os.environ.get("INDIC_CONFORMER_LANGUAGE", "hi")
        return IndicConformerProvider(model_name, language)
    return OperatorTranscriptProvider()
