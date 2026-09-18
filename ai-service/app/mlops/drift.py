"""Drift detection over real production SVI outputs.

Every /v1/assess call appends its SVI value to data/svi_history.jsonl (via
log_score below). This module compares a recent window against a baseline
window using a simple z-score-on-the-mean test - genuine statistics over
whatever has actually been scored, not simulated data. With too little
history it correctly reports "insufficient_data" rather than a fabricated
verdict.
"""

from __future__ import annotations

import json
import statistics
import time
from pathlib import Path

from app.config import get_settings

HISTORY_FILE = "svi_history.jsonl"
BASELINE_WINDOW = 50
RECENT_WINDOW = 20
DRIFT_Z_THRESHOLD = 2.0


def _history_path() -> Path:
    settings = get_settings()
    return Path(settings.model_registry_path).parent / HISTORY_FILE


def log_score(value: float, band: str) -> None:
    path = _history_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a") as f:
        f.write(json.dumps({"value": value, "band": band, "ts": int(time.time())}) + "\n")


def check_drift() -> dict:
    path = _history_path()
    if not path.exists():
        return {"status": "insufficient_data", "reason": "no scores logged yet"}

    values = [json.loads(line)["value"] for line in path.read_text().splitlines() if line.strip()]
    if len(values) < BASELINE_WINDOW + RECENT_WINDOW:
        return {"status": "insufficient_data", "count": len(values), "required": BASELINE_WINDOW + RECENT_WINDOW}

    baseline = values[-(BASELINE_WINDOW + RECENT_WINDOW) : -RECENT_WINDOW]
    recent = values[-RECENT_WINDOW:]

    baseline_mean = statistics.mean(baseline)
    baseline_std = statistics.pstdev(baseline) or 1e-6
    recent_mean = statistics.mean(recent)

    z_score = (recent_mean - baseline_mean) / (baseline_std / (RECENT_WINDOW**0.5))
    drifted = abs(z_score) >= DRIFT_Z_THRESHOLD

    return {
        "status": "drift_detected" if drifted else "stable",
        "baseline_mean": round(baseline_mean, 2),
        "recent_mean": round(recent_mean, 2),
        "z_score": round(z_score, 2),
        "threshold": DRIFT_Z_THRESHOLD,
        "recommendation": "Trigger retraining/re-tuning review" if drifted else "No action needed",
    }
