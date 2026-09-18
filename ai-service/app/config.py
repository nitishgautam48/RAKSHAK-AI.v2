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

    # Speech-to-text: see engines/speech_engine.py for why this defaults to
    # "operator_transcript" rather than a downloaded ASR model in this
    # environment (model-weight hosts are blocked by sandbox egress policy).
    stt_provider: str = "operator_transcript"

    model_registry_path: str = str(BASE_DIR / "data" / "model_registry.json")
    dataset_registry_path: str = str(BASE_DIR / "data" / "dataset_registry.json")
    eval_results_path: str = str(BASE_DIR / "data" / "eval_results.json")


@lru_cache
def get_settings() -> Settings:
    return Settings()
