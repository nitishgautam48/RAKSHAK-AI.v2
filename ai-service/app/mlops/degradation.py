"""Observability for silent engine degrades.

speech_engine (STT), voice_engine (voice-stress DSP), and llm_engine all
have a deliberate "degrade gracefully, never break the whole assessment"
design: a real ASR/DSP/LLM failure falls back to a safe default (typed
narrative, no voice signal, no LLM blend) instead of a 500. That's the
right behavior for any single request, but nothing previously recorded HOW
OFTEN it actually happens - an admin had no way to tell "Whisper is
silently failing on 40% of calls with real audio" from "STT just isn't
configured for this deployment." This is a real, append-only log of every
actual degrade event (NOT "feature disabled by config", which isn't a
failure - see the call sites in main.py for what counts as which), in the
same append-only-JSONL style as drift.py's svi_history.jsonl.
"""

from __future__ import annotations

import json
import time
from collections import Counter
from pathlib import Path

from app.config import get_settings

LOG_FILE = "degradation_events.jsonl"
DEFAULT_RECENT_WINDOW_SECONDS = 24 * 60 * 60


def _log_path() -> Path:
    settings = get_settings()
    return Path(settings.model_registry_path).parent / LOG_FILE


def log_degradation(engine: str, reason: str) -> None:
    path = _log_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a") as f:
        f.write(json.dumps({"engine": engine, "reason": reason, "ts": int(time.time())}) + "\n")


def get_degradation_summary(recent_window_seconds: int = DEFAULT_RECENT_WINDOW_SECONDS) -> dict:
    path = _log_path()
    if not path.exists():
        return {
            "totalEvents": 0, "recentEvents": 0, "recentWindowHours": recent_window_seconds / 3600,
            "byEngine": {}, "byEngineReason": {}, "recentByEngine": {}, "recentByEngineReason": {},
        }

    events = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    now = time.time()
    recent = [e for e in events if now - e["ts"] <= recent_window_seconds]

    def _counts(evs: list[dict]) -> tuple[dict, dict]:
        by_engine = dict(Counter(e["engine"] for e in evs))
        by_engine_reason = dict(Counter(f"{e['engine']}:{e['reason']}" for e in evs))
        return by_engine, by_engine_reason

    by_engine, by_engine_reason = _counts(events)
    recent_by_engine, recent_by_engine_reason = _counts(recent)

    return {
        "totalEvents": len(events),
        "recentEvents": len(recent),
        "recentWindowHours": recent_window_seconds / 3600,
        "byEngine": by_engine,
        "byEngineReason": by_engine_reason,
        "recentByEngine": recent_by_engine,
        "recentByEngineReason": recent_by_engine_reason,
    }
