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

    # Speech-to-text provider: "operator_transcript" (default, no ASR) or
    # "whisper_local" (real faster-whisper transcription - also needs
    # WHISPER_MODEL_PATH set; see engines/speech_engine.py for what that
    # accepts and why this isn't the default in every environment).
    stt_provider: str = "operator_transcript"

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

    model_registry_path: str = str(BASE_DIR / "data" / "model_registry.json")
    dataset_registry_path: str = str(BASE_DIR / "data" / "dataset_registry.json")
    eval_results_path: str = str(BASE_DIR / "data" / "eval_results.json")


@lru_cache
def get_settings() -> Settings:
    return Settings()
