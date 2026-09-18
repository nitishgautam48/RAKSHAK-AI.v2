"""Model + dataset registries.

Honest framing: the "models" versioned here are the deterministic scoring
formulas in app/engines/ (see svi_engine.WEIGHTS, nlp_engine.LEXICON), not
trained neural network checkpoints. They are still real, deployable,
versioned artifacts - changing a weight or lexicon entry is a genuine model
change that should be versioned, evaluated and rollback-able, which is
exactly what this registry supports. It is real MLOps process built to be
pointed at trained models later without an architecture change: swap
`origin: "rule_based"` for `origin: "trained_checkpoint"` and add a
`checkpoint_uri`, and every consumer of this registry keeps working.
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

from app.config import get_settings


def _read_json(path: str, default: Any) -> Any:
    p = Path(path)
    if not p.exists():
        return default
    return json.loads(p.read_text())


def _write_json(path: str, data: Any) -> None:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, indent=2))


def register_model_version(engine: str, version: str, meta: dict) -> dict:
    settings = get_settings()
    registry = _read_json(settings.model_registry_path, {"models": []})
    entry = {
        "engine": engine,
        "version": version,
        "origin": meta.get("origin", "rule_based"),
        "registeredAt": int(time.time()),
        "meta": meta,
        "status": "active",
    }
    # Supersede any prior "active" entry for the same engine, keep history.
    for m in registry["models"]:
        if m["engine"] == engine and m["status"] == "active":
            m["status"] = "superseded"
    registry["models"].append(entry)
    _write_json(settings.model_registry_path, registry)
    return entry


def list_model_versions() -> list[dict]:
    settings = get_settings()
    return _read_json(settings.model_registry_path, {"models": []})["models"]


def active_versions() -> dict[str, str]:
    versions = {}
    for m in list_model_versions():
        if m["status"] == "active":
            versions[m["engine"]] = m["version"]
    return versions


def register_dataset(name: str, meta: dict) -> dict:
    settings = get_settings()
    registry = _read_json(settings.dataset_registry_path, {"datasets": []})
    entry = {"name": name, "registeredAt": int(time.time()), "meta": meta}
    registry["datasets"].append(entry)
    _write_json(settings.dataset_registry_path, registry)
    return entry


def list_datasets() -> list[dict]:
    settings = get_settings()
    return _read_json(settings.dataset_registry_path, {"datasets": []})["datasets"]
