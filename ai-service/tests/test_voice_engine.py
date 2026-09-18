"""Unit tests for the Voice Analysis Engine's DSP math, using synthetic
signals with known ground truth (see app/mlops/voice_evaluation.py for the
fuller harness and why this is real validation, not illustrative guessing).
"""

from app.engines import voice_engine
from app.mlops.voice_evaluation import _tone, _vibrato_tone, _wav_bytes


def test_pitch_detection_accuracy_on_known_tone():
    feats = voice_engine.extract_features(_wav_bytes(_tone(200.0)))
    assert abs(feats.mean_pitch_hz - 200.0) / 200.0 < 0.05  # within 5%


def test_pitch_is_gain_invariant():
    quiet = voice_engine.extract_features(_wav_bytes(_tone(200.0, amp=0.1)))
    loud = voice_engine.extract_features(_wav_bytes(_tone(200.0, amp=0.9)))
    assert abs(quiet.mean_pitch_hz - loud.mean_pitch_hz) < 2.0


def test_energy_increases_with_amplitude():
    quiet = voice_engine.extract_features(_wav_bytes(_tone(200.0, amp=0.1)))
    loud = voice_engine.extract_features(_wav_bytes(_tone(200.0, amp=0.9)))
    assert loud.mean_energy_db > quiet.mean_energy_db


def test_tremor_index_increases_with_vibrato_depth():
    steady = voice_engine.extract_features(_wav_bytes(_tone(180.0)))
    shaky = voice_engine.extract_features(_wav_bytes(_vibrato_tone(180.0, 30.0)))
    assert shaky.tremor_index > steady.tremor_index


def test_voice_stress_score_responds_to_tremor():
    calm = voice_engine.analyze(_wav_bytes(_tone(180.0)))
    shaky = voice_engine.analyze(_wav_bytes(_vibrato_tone(180.0, 30.0)))
    assert shaky.voice_stress_score > calm.voice_stress_score


def test_silent_clip_reports_no_pitch_rather_than_fabricating_one():
    import numpy as np
    silent = voice_engine.extract_features(_wav_bytes(np.zeros(32000)))
    assert silent.mean_pitch_hz == 0.0
