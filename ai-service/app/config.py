from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "TraumaSense AI Service"
    environment: str = "development"
    port: int = 8000

    # Shared secret the Node backend must present (X-Service-Key header) so this
    # compute service isn't reachable directly from the internet. Stateless
    # services like this one don't do their own user auth/RBAC - the Node
    # gateway (server/) is the single authenticated entry point per the
    # architecture decision recorded in server/README.md.
    service_key: str = "dev-insecure-service-key-change-me"

    # Speech-to-text provider: "operator_transcript" (default, no ASR),
    # "whisper_local" (real faster-whisper transcription - also needs
    # WHISPER_MODEL_PATH set), or "indic_conformer" (AI4Bharat's Indian-
    # language-specific ASR via NVIDIA NeMo - needs INDIC_CONFORMER_MODEL_NAME
    # set, and supports exactly one configured language per deployment via
    # INDIC_CONFORMER_LANGUAGE). See engines/speech_engine.py for what each
    # accepts, real tradeoffs between the two ASR options, and why neither
    # is the default in every environment.
    stt_provider: str = "operator_transcript"

    # faster-whisper's own concurrency knob (CTranslate2's num_workers) -
    # the same shared model instance is used for every live-transcription
    # connection and every batch /v1/assess call (see get_shared_model() in
    # streaming_transcription.py and LocalWhisperProvider in
    # speech_engine.py). Left at faster-whisper's own default of 1, two
    # people speaking live at the same time would genuinely queue behind
    # each other for transcription - not a crash or a data-corruption risk
    # (CTranslate2 queues concurrent calls to one worker safely), just
    # rising latency under concurrent load. Raising this trades memory for
    # real parallelism (per faster-whisper's own docs: "concurrent calls to
    # self.model.generate() will run in parallel") - 4 is a reasonable
    # starting point for a handful of simultaneous live sessions on CPU;
    # tune based on real deployment concurrency and available RAM.
    whisper_num_workers: int = 4

    # Optional real-language-understanding signal (see engines/llm_engine.py)
    # to catch narratives that describe something serious without using any
    # lexicon term - a structural limitation the keyword engine cannot fix by
    # adding more keywords. Unset by default: this is a genuine deployment
    # decision (a real Anthropic API key, real per-call cost, real outbound
    # network dependency), not something to enable silently. The engine
    # degrades to "not run" with no error when this is empty.
    anthropic_api_key: str | None = None
    narrative_llm_model: str = "claude-haiku-4-5-20251001"

    # Free, local, no-API-key alternative/complement to the LLM pass above
    # (see engines/semantic_engine.py) - on by default since there's no
    # cost/key gate, unlike the LLM pass. Set to true to skip it entirely,
    # e.g. on a memory-constrained deployment that can't afford the ~220MB
    # embedding model, or to avoid the one-time download on a host with
    # restricted network access.
    disable_semantic_analysis: bool = False

    # Opt-in Indic-to-English translation (see engines/translation_engine.py)
    # for narratives in languages OUTSIDE the NLP lexicon's 8-language
    # coverage - needs transformers+torch, a real new dependency not used
    # anywhere else in this service, so this is off by default like the LLM
    # engine's key gate, not on-by-default like the semantic engine.
    enable_indic_translation: bool = False

    # Opt-in, EXPERIMENTAL native-language semantic matching via IndicBERT
    # (see engines/indic_semantic_engine.py) - off by default even more
    # deliberately than the translation flag above: IndicBERT was not
    # fine-tuned for sentence-similarity, so this signal's real usefulness
    # is genuinely unproven (see that file's docstring caveat), not just
    # gated on dependency weight.
    enable_indic_bert_semantic: bool = False

    model_registry_path: str = str(BASE_DIR / "data" / "model_registry.json")
    dataset_registry_path: str = str(BASE_DIR / "data" / "dataset_registry.json")
    eval_results_path: str = str(BASE_DIR / "data" / "eval_results.json")


@lru_cache
def get_settings() -> Settings:
    return Settings()
