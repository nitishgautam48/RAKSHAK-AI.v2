"""Voice Analysis Engine - real digital signal processing, no fabricated model.

Every number here is computed directly from the uploaded audio waveform using
established, real acoustic-analysis tooling: librosa (pYIN pitch tracking,
RMS energy, framing) and parselmouth/Praat (jitter, shimmer, harmonics-to-
noise ratio - the standard voice-quality measures researchers actually use).
This replaces an earlier hand-rolled autocorrelation/frame-diff implementation
with the same tools a acoustic-phonetics lab would reach for, which measurably
improves pitch-tracking accuracy and gives tremor_index a genuine cycle-to-
cycle jitter basis instead of a coarse frame-to-frame pitch-diff proxy.

This deliberately still avoids the neural voice-stress models named in the
original spec (Wav2Vec2 / SpeechBrain / HuBERT): downloading their weights
requires huggingface.co, which this deployment's egress policy blocks (see
ai-service/README.md). What's here is genuinely computed signal analysis, not
a placeholder - it is just not a *trained clinical* model, and its "stress"
output is explicitly a signal-processing proxy, not a diagnosis. See
app/mlops/voice_evaluation.py for what is and isn't validated about it.
"""

from __future__ import annotations

import io
import math
from dataclasses import dataclass, field

import librosa
import numpy as np
import parselmouth
import soundfile as sf
from parselmouth.praat import call

FRAME_MS = 32
HOP_MS = 16
MIN_F0 = 70.0  # Hz - lower bound of plausible human voice fundamental
MAX_F0 = 400.0
SILENCE_RMS_RATIO = 0.08  # fraction of peak RMS below which a frame counts as a pause
PYIN_FRAME_LENGTH = 2048  # librosa default analysis window for pYIN

# Ceiling used to normalize Praat's real relative local-jitter measurement
# (typically <0.01 for a steady voice, climbing toward ~0.02-0.03+ for a
# strongly tremoring/pathological one - see e.g. MDVP clinical jitter norms,
# ~1.04% commonly cited as an abnormality threshold) into this engine's 0-1
# tremor_index scale. This ceiling is a scaling choice, not a validated
# clinical cutoff - see the module's honesty note above.
JITTER_REFERENCE = 0.02


@dataclass
class VoiceFeatures:
    duration_sec: float
    sample_rate: int
    mean_pitch_hz: float
    pitch_std_hz: float
    mean_energy_db: float
    pause_count: int
    pause_ratio: float  # fraction of total duration spent in silence
    speech_rate_proxy: float  # voiced-frame rate, syllable-rate proxy 0-1
    tremor_index: float  # normalized real vocal jitter (Praat local jitter), 0-1
    # Real Praat voice-quality measures, genuinely computed (not derived from
    # tremor_index) - additive detail, not required by any existing consumer.
    jitter_local: float  # relative local jitter (cycle-to-cycle period perturbation)
    shimmer_local: float  # relative local shimmer (cycle-to-cycle amplitude perturbation)
    hnr_db: float  # harmonics-to-noise ratio in dB; lower = breathier/noisier voice
    pitch_contour: list[float] = field(default_factory=list)
    energy_contour: list[float] = field(default_factory=list)


@dataclass
class VoiceMetrics:
    speaking_speed_wpm: float | None
    pause_frequency: str
    confidence_score: float
    voice_stress: str
    voice_stress_score: float  # 0-100
    speech_tremor: str
    fear_indicator_count: int
    features: VoiceFeatures


def _load_audio(audio_bytes: bytes) -> tuple[np.ndarray, int]:
    data, sr = sf.read(io.BytesIO(audio_bytes), dtype="float64", always_2d=False)
    if data.ndim > 1:
        data = data.mean(axis=1)  # downmix to mono
    return data, sr


def _extract_pitch(y: np.ndarray, sr: int, hop_length: int) -> tuple[np.ndarray, np.ndarray]:
    """pYIN pitch tracking (librosa) - more robust than plain autocorrelation,
    the standard choice for monophonic F0 estimation. Returns (f0_per_frame,
    voiced_flag_per_frame); f0 is NaN where unvoiced/undetected."""
    frame_length = min(PYIN_FRAME_LENGTH, max(1, len(y)))
    if frame_length < 32:  # too short for any meaningful pitch analysis
        return np.array([]), np.array([], dtype=bool)
    try:
        f0, voiced_flag, _ = librosa.pyin(
            y, sr=sr, fmin=MIN_F0, fmax=MAX_F0, frame_length=frame_length, hop_length=hop_length,
        )
    except Exception:  # noqa: BLE001 - degrade to "no pitch detected", never crash the assessment
        return np.array([]), np.array([], dtype=bool)
    if voiced_flag is None:
        voiced_flag = ~np.isnan(f0)
    return f0, voiced_flag


def _extract_voice_quality(y: np.ndarray, sr: int) -> tuple[float, float, float]:
    """Real Praat voice-quality measures via parselmouth: local jitter, local
    shimmer, harmonics-to-noise ratio. Praat's periodic-pulse extraction needs
    a real pitch period to lock onto, so this legitimately fails (raises) on
    audio too short or too quiet to contain one - caught and degraded to
    zeros rather than fabricating a measurement, same principle as the rest
    of this engine."""
    try:
        snd = parselmouth.Sound(y, sampling_frequency=sr)
        point_process = call(snd, "To PointProcess (periodic, cc)", MIN_F0, MAX_F0)
        jitter = call(point_process, "Get jitter (local)", 0, 0, 0.0001, 0.02, 1.3)
        shimmer = call([snd, point_process], "Get shimmer (local)", 0, 0, 0.0001, 0.02, 1.3, 1.6)
        harmonicity = snd.to_harmonicity_cc()
        hnr = call(harmonicity, "Get mean", 0, 0)
    except Exception:  # noqa: BLE001 - too short/silent/atonal for periodic-pulse extraction
        return 0.0, 0.0, 0.0
    jitter = 0.0 if math.isnan(jitter) else float(jitter)
    shimmer = 0.0 if math.isnan(shimmer) else float(shimmer)
    hnr = 0.0 if math.isnan(hnr) else float(hnr)
    return jitter, shimmer, hnr


def extract_features(audio_bytes: bytes) -> VoiceFeatures:
    data, sr = _load_audio(audio_bytes)

    hop_length = max(1, int(sr * HOP_MS / 1000))
    energy_frame_length = max(1, int(sr * FRAME_MS / 1000))

    # RMS energy framing kept at the original, tighter 32ms/16ms window (not
    # pYIN's wider 2048-sample analysis window) so pause boundaries stay
    # sharp rather than smeared across a ~128ms window - verified against
    # synthetic tone/silence/tone fixtures in app/mlops/voice_evaluation.py.
    if len(data) < energy_frame_length:
        rms = np.array([float(np.sqrt(np.mean(data**2)) + 1e-12)]) if data.size else np.array([1e-12])
    else:
        rms = librosa.feature.rms(y=data, frame_length=energy_frame_length, hop_length=hop_length)[0]
    energies_db = 20 * np.log10(rms + 1e-12)

    peak_energy = float(np.max(energies_db))
    silence_floor = peak_energy + 20 * np.log10(SILENCE_RMS_RATIO)
    voiced_energy_mask = energies_db > silence_floor
    pause_mask = ~voiced_energy_mask

    f0, voiced_flag = _extract_pitch(data, sr, hop_length)
    if f0.size:
        # Intersect pYIN's own voiced/unvoiced call with the energy-based
        # voiced mask (same principle as the original engine): a frame pYIN
        # thinks is voiced but that's actually below the silence floor (e.g.
        # a stray low-confidence guess in near-silence) shouldn't count.
        n = min(len(f0), len(voiced_energy_mask))
        combined_voiced = voiced_flag[:n] & voiced_energy_mask[:n] & ~np.isnan(f0[:n])
        voiced_pitches = f0[:n][combined_voiced]
    else:
        voiced_pitches = np.array([])

    mean_pitch = float(np.mean(voiced_pitches)) if voiced_pitches.size else 0.0
    pitch_std = float(np.std(voiced_pitches)) if voiced_pitches.size else 0.0

    # Pause count: number of contiguous silent-frame runs of at least ~48ms,
    # a simple debounce so single quiet frames don't count.
    frame_dur_sec = hop_length / sr if sr else HOP_MS / 1000
    min_run = max(1, round(0.048 / frame_dur_sec))
    pause_count = 0
    run = 0
    for silent in pause_mask:
        if silent:
            run += 1
        else:
            if run >= min_run:
                pause_count += 1
            run = 0
    if run >= min_run:
        pause_count += 1

    pause_ratio = float(np.mean(pause_mask)) if pause_mask.size else 1.0
    speech_rate_proxy = float(np.mean(voiced_energy_mask)) if voiced_energy_mask.size else 0.0

    jitter_local, shimmer_local, hnr_db = _extract_voice_quality(data, sr)
    # Real cycle-to-cycle jitter (Praat), normalized against JITTER_REFERENCE
    # into this engine's 0-1 tremor scale - a genuine acoustic-tremor
    # measurement, replacing the earlier coarse frame-to-frame pitch-diff
    # approximation.
    tremor_index = float(np.clip(jitter_local / JITTER_REFERENCE, 0.0, 1.0))

    duration_sec = len(data) / sr if sr else 0.0

    pitch_contour_source = np.nan_to_num(f0, nan=0.0) if f0.size else np.array([])

    return VoiceFeatures(
        duration_sec=duration_sec,
        sample_rate=sr,
        mean_pitch_hz=mean_pitch,
        pitch_std_hz=pitch_std,
        mean_energy_db=float(np.mean(energies_db)),
        pause_count=pause_count,
        pause_ratio=pause_ratio,
        speech_rate_proxy=speech_rate_proxy,
        tremor_index=tremor_index,
        jitter_local=jitter_local,
        shimmer_local=shimmer_local,
        hnr_db=hnr_db,
        pitch_contour=[round(float(p), 1) for p in pitch_contour_source[:400]],
        energy_contour=[round(float(e), 1) for e in energies_db.tolist()[:400]],
    )


def _bucket(value: float, low: float, high: float) -> str:
    if value < low:
        return "Low"
    if value < high:
        return "Moderate"
    return "High"


def analyze(audio_bytes: bytes, transcript_word_count: int | None = None) -> VoiceMetrics:
    f = extract_features(audio_bytes)

    # Voice stress score (0-100): a documented, explainable weighted sum of
    # three normalized signal features. This is a heuristic scoring formula,
    # not a trained classifier - every weight is stated here so the score is
    # fully auditable (see AIExplanation output from the SVI engine). Each
    # input is now a genuinely stronger real measurement than before (pYIN
    # pitch, Praat jitter-based tremor) - the formula's WEIGHTS are still a
    # heuristic calibration, not a clinically validated model.
    pitch_variability = min(1.0, f.pitch_std_hz / max(f.mean_pitch_hz, 1.0)) if f.mean_pitch_hz else 0.0
    stress_score = 100 * np.clip(
        0.45 * f.tremor_index + 0.35 * pitch_variability + 0.20 * min(1.0, f.pause_ratio * 2),
        0.0,
        1.0,
    )

    voice_stress = "Elevated" if stress_score >= 70 else "High" if stress_score >= 55 else "Moderate" if stress_score >= 35 else "Low"
    speech_tremor = _bucket(f.tremor_index, 0.15, 0.35)
    pause_frequency = _bucket(f.pause_ratio, 0.15, 0.35)

    speaking_speed_wpm = None
    if transcript_word_count and f.duration_sec > 0:
        speaking_speed_wpm = round(transcript_word_count / (f.duration_sec / 60), 1)

    # Fear-indicator count: sharp, isolated pitch spikes above 1.5 std devs
    # from the mean, a proxy for the vocal "catch"/spike pattern associated
    # with acute fear response in the voice-stress literature.
    voiced = np.array([p for p in f.pitch_contour if p > 0])
    fear_indicator_count = 0
    if voiced.size > 2 and f.pitch_std_hz > 0:
        spikes = np.abs(voiced - f.mean_pitch_hz) > 1.5 * f.pitch_std_hz
        fear_indicator_count = int(np.sum(spikes))

    confidence_score = float(np.clip(60 + 30 * min(1.0, f.duration_sec / 8), 0, 95))

    return VoiceMetrics(
        speaking_speed_wpm=speaking_speed_wpm,
        pause_frequency=pause_frequency,
        confidence_score=round(confidence_score, 1),
        voice_stress=voice_stress,
        voice_stress_score=round(float(stress_score), 1),
        speech_tremor=speech_tremor,
        fear_indicator_count=fear_indicator_count,
        features=f,
    )
