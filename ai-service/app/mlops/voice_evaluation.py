"""Evaluation harness for the Voice Analysis Engine.

Unlike the NLP/SVI harness, there is no equivalent of "hand-written
narratives" here - there's no real speech corpus available in this sandbox
(no internet access to download one, and no ethical basis to record real
survivors for test fixtures). What IS possible, and genuinely meaningful:
generate synthetic audio signals with mathematically KNOWN properties
(known pitch, known silence gaps, known jitter) using numpy, and verify the
DSP math actually measures what it claims to measure. This is real
validation, not illustrative guessing - a 200Hz sine wave has an actual,
checkable correct pitch, unlike a hand-written narrative's "correct"
severity, which is inherently a judgment call.

What this does NOT validate: whether the voice_stress_score composite
formula's WEIGHTS correctly track real human vocal stress. That question
needs real speech samples with expert-labeled ground truth, exactly like
the NLP engine's real accuracy question - this harness only confirms the
underlying signal measurements (pitch, energy, silence, jitter) are
computed correctly, which is the necessary foundation any such formula
would sit on.
"""

from __future__ import annotations

import io

import numpy as np
import soundfile as sf

from app.engines import voice_engine

SAMPLE_RATE = 16000


def _wav_bytes(data: np.ndarray, sr: int = SAMPLE_RATE) -> bytes:
    buf = io.BytesIO()
    sf.write(buf, data.astype(np.float32), sr, format="WAV")
    return buf.getvalue()


def _tone(freq: float, duration: float = 2.0, amp: float = 0.5, sr: int = SAMPLE_RATE) -> np.ndarray:
    t = np.arange(0, duration, 1 / sr)
    return amp * np.sin(2 * np.pi * freq * t)


def _vibrato_tone(base_freq: float, depth_hz: float, duration: float = 2.0, amp: float = 0.5, sr: int = SAMPLE_RATE) -> np.ndarray:
    t = np.arange(0, duration, 1 / sr)
    inst_freq = base_freq + depth_hz * np.sin(2 * np.pi * 6 * t)  # 6Hz modulation, typical vocal vibrato rate
    phase = 2 * np.pi * np.cumsum(inst_freq) / sr
    return amp * np.sin(phase)


# ---------------------------------------------------------------------------
# 1. Pitch detection accuracy: pure tones at known frequencies.
# ---------------------------------------------------------------------------
PITCH_CASES = [
    {"id": "pitch-1", "true_hz": 100.0},
    {"id": "pitch-2", "true_hz": 150.0},
    {"id": "pitch-3", "true_hz": 200.0},
    {"id": "pitch-4", "true_hz": 250.0},
    {"id": "pitch-5", "true_hz": 300.0},
    {"id": "pitch-6", "true_hz": 350.0},
]
PITCH_TOLERANCE_PCT = 1.0  # pYIN's measured real error on this signal class tops out ~0.21%


def _check_pitch_accuracy() -> dict:
    results = []
    passed = 0
    for case in PITCH_CASES:
        feats = voice_engine.extract_features(_wav_bytes(_tone(case["true_hz"])))
        err_pct = 100 * abs(feats.mean_pitch_hz - case["true_hz"]) / case["true_hz"]
        ok = err_pct <= PITCH_TOLERANCE_PCT
        passed += int(ok)
        results.append({
            "id": case["id"], "true_hz": case["true_hz"], "detected_hz": round(feats.mean_pitch_hz, 1),
            "error_pct": round(err_pct, 2), "passed": ok,
        })
    return {"description": "Pure sine tones at known frequencies - checks librosa pYIN pitch tracking against real ground truth.", "total": len(PITCH_CASES), "passed": passed, "pass_rate": round(100 * passed / len(PITCH_CASES), 1), "results": results}


# ---------------------------------------------------------------------------
# 2. Gain invariance: pitch estimate should not depend on volume.
# ---------------------------------------------------------------------------
def _check_gain_invariance() -> dict:
    amps = [0.1, 0.3, 0.5, 0.9]
    pitches = [round(voice_engine.extract_features(_wav_bytes(_tone(200.0, amp=a))).mean_pitch_hz, 1) for a in amps]
    spread = max(pitches) - min(pitches)
    passed = spread <= 2.0  # Hz - should be essentially identical across gain
    return {"description": "Same 200Hz tone at 4 different volumes - pitch estimate should not change with loudness.", "detected_hz_by_amplitude": dict(zip(amps, pitches)), "spread_hz": round(spread, 2), "passed": passed}


# ---------------------------------------------------------------------------
# 3. Energy monotonicity: louder signal -> higher measured energy (dB).
# ---------------------------------------------------------------------------
def _check_energy_monotonic() -> dict:
    amps = [0.1, 0.3, 0.5, 0.9]
    energies = [round(voice_engine.extract_features(_wav_bytes(_tone(200.0, amp=a))).mean_energy_db, 1) for a in amps]
    passed = all(energies[i] < energies[i + 1] for i in range(len(energies) - 1))
    return {"description": "Same tone at increasing volume should measure strictly increasing energy (dB).", "energy_db_by_amplitude": dict(zip(amps, energies)), "passed": passed}


# ---------------------------------------------------------------------------
# 4. Silence/pause detection: known number and length of silent gaps.
# ---------------------------------------------------------------------------
def _check_pause_detection() -> dict:
    sr = SAMPLE_RATE
    seg = 0.6
    tone = _tone(180.0, duration=seg)
    silence = np.zeros(int(seg * sr))
    data = np.concatenate([tone, silence, tone, silence, tone])  # 2 real silence gaps
    feats = voice_engine.extract_features(_wav_bytes(data, sr))
    expected_pause_ratio = (2 * seg) / (5 * seg)  # 2 of 5 equal segments are silent
    ratio_ok = abs(feats.pause_ratio - expected_pause_ratio) <= 0.1
    count_ok = feats.pause_count == 2
    return {
        "description": "Tone-silence-tone-silence-tone with 2 known 0.6s silence gaps out of 3.0s total.",
        "expected_pause_count": 2, "detected_pause_count": feats.pause_count,
        "expected_pause_ratio": round(expected_pause_ratio, 2), "detected_pause_ratio": round(feats.pause_ratio, 2),
        "passed": ratio_ok and count_ok,
    }


# ---------------------------------------------------------------------------
# 5. Tremor proportionality: more frequency modulation -> higher tremor_index.
# ---------------------------------------------------------------------------
def _check_tremor_monotonic() -> dict:
    depths = [0.0, 5.0, 15.0, 30.0]
    indices = [round(voice_engine.extract_features(_wav_bytes(_vibrato_tone(180.0, d))).tremor_index, 4) for d in depths]
    passed = all(indices[i] < indices[i + 1] for i in range(len(indices) - 1))
    return {"description": "180Hz tone with increasing vibrato (frequency modulation) depth should produce strictly increasing tremor_index.", "tremor_index_by_depth_hz": dict(zip(depths, indices)), "passed": passed}


# ---------------------------------------------------------------------------
# 6. Voice-stress score responds to its own documented inputs (tremor).
# ---------------------------------------------------------------------------
def _check_stress_score_responds_to_tremor() -> dict:
    calm = voice_engine.analyze(_wav_bytes(_tone(180.0)))
    shaky = voice_engine.analyze(_wav_bytes(_vibrato_tone(180.0, 30.0)))
    passed = shaky.voice_stress_score > calm.voice_stress_score
    return {
        "description": "A steady tone vs. one with heavy jitter/vibrato - the composite voice_stress_score should be higher for the shaky signal, since tremor is one of its documented inputs.",
        "calm_stress_score": calm.voice_stress_score, "shaky_stress_score": shaky.voice_stress_score, "passed": passed,
    }


# ---------------------------------------------------------------------------
# Known limitations - genuine edge cases the current DSP approach handles
# imperfectly, documented rather than hidden.
# ---------------------------------------------------------------------------
def _known_limitations() -> list[dict]:
    results = []

    # A truly all-zero (digital silence) clip: silence detection is relative
    # to the loudest frame in the SAME clip, so with no loud reference frame
    # to compare against, nothing gets classified as a "pause" even though
    # the entire clip is silent. mean_pitch_hz correctly reads 0 (no voice
    # detected), which is the more important honest signal, but pause_ratio
    # for this specific degenerate case is not meaningful.
    silent = voice_engine.extract_features(_wav_bytes(np.zeros(int(2 * SAMPLE_RATE))))
    results.append({
        "id": "voice-limit-1",
        "why_hard": "Fully-silent input has no louder reference frame for the relative silence threshold to compare against, so pause_ratio reads 0 instead of 1 for a clip that is entirely silence. mean_pitch_hz=0 is the more load-bearing 'no voice detected' signal and is correct.",
        "mean_pitch_hz": silent.mean_pitch_hz, "pause_ratio": silent.pause_ratio,
    })

    # Very short clip (shorter than one analysis frame): should degrade
    # gracefully (zeroed-out features), not crash.
    try:
        short = voice_engine.extract_features(_wav_bytes(_tone(200.0, duration=0.01)))
        results.append({
            "id": "voice-limit-2",
            "why_hard": "A clip shorter than one analysis frame (32ms) can't produce a reliable pitch/energy estimate - it degrades to near-zero features rather than erroring, which is the right behavior, but it's worth stating plainly that sub-frame clips carry no real signal.",
            "duration_sec": short.duration_sec, "mean_pitch_hz": short.mean_pitch_hz,
        })
    except Exception as e:  # noqa: BLE001 - this IS the check: does it crash?
        results.append({"id": "voice-limit-2", "why_hard": "Sub-frame-length clip raised an exception instead of degrading gracefully.", "error": str(e)})

    return results


def run_voice_eval() -> dict:
    pitch = _check_pitch_accuracy()
    gain = _check_gain_invariance()
    energy = _check_energy_monotonic()
    pause = _check_pause_detection()
    tremor = _check_tremor_monotonic()
    stress = _check_stress_score_responds_to_tremor()

    core_checks = [gain["passed"], energy["passed"], pause["passed"], tremor["passed"], stress["passed"]]

    return {
        "disclaimer": (
            "This validates the DSP math (pitch/energy/silence/jitter measurement) against synthetic "
            "signals with known ground truth - genuine validation, since a sine wave's true pitch is a "
            "checkable fact. It does NOT validate that the voice_stress_score composite formula's weights "
            "match real human vocal stress - that requires real speech samples with expert-labeled ground "
            "truth, which isn't available here (see NLP evaluation.py for the same limitation, worse, on text)."
        ),
        "pitch_accuracy": pitch,
        "gain_invariance": gain,
        "energy_monotonicity": energy,
        "pause_detection": pause,
        "tremor_monotonicity": tremor,
        "stress_score_responds_to_tremor": stress,
        "all_core_checks_passed": all(core_checks),
        "known_limitations": _known_limitations(),
    }
