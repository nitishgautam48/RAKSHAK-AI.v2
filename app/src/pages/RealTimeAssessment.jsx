import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import TranscriptSourceBadge from '../components/TranscriptSourceBadge';
import { useLiveTranscription } from '../lib/useLiveTranscription';

const card = { background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 14, padding: 20 };
// Keyed to the backend's RiskLevel enum (LOW/MODERATE/HIGH/CRITICAL), not
// the Capitalized keys in data/constants.js's mock-data RISK_COLORS.
const RISK_COLORS = { LOW: 'oklch(0.72 0.15 145)', MODERATE: 'oklch(0.8 0.15 95)', HIGH: 'oklch(0.7 0.17 55)', CRITICAL: 'oklch(0.62 0.21 25)' };
const WAVE_BAR_COUNT = 28;
const IDLE_WAVE_BARS = Array(WAVE_BAR_COUNT).fill(0.04);

function formatDuration(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function RealTimeAssessment() {
  const [complaints, setComplaints] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [narrative, setNarrative] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [audioFile, setAudioFile] = useState(null);
  const [audioBase64, setAudioBase64] = useState(null);
  const [waveBars, setWaveBars] = useState(IDLE_WAVE_BARS);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const live = useLiveTranscription();
  const appendedSegmentCount = useRef(0);

  // Append each newly finalized segment onto the narrative as it arrives -
  // this is what makes it "live": the operator sees real spoken words land
  // in the transcript a few seconds after being said, not only once the
  // whole call ends. The in-progress (not-yet-finalized) partial is shown
  // separately below rather than written into the textarea, since it can
  // still be revised before it finalizes.
  useEffect(() => {
    if (live.segments.length <= appendedSegmentCount.current) return;
    const newText = live.segments.slice(appendedSegmentCount.current).join(' ');
    appendedSegmentCount.current = live.segments.length;
    setNarrative((prev) => (prev.trim() ? `${prev.trim()} ${newText}` : newText));
  }, [live.segments]);

  // Real (not simulated) waveform, sampled from the actual mic input via an
  // AnalyserNode - see useLiveTranscription.js's getWaveformLevels(). Runs
  // its own animation-frame loop rather than putting audio-rate updates
  // through React state directly; throttled to ~10fps, plenty smooth for a
  // bar visualization and far cheaper than re-rendering at full frame rate.
  useEffect(() => {
    if (!live.isActive) {
      setWaveBars(IDLE_WAVE_BARS);
      return undefined;
    }
    let raf;
    let lastUpdate = 0;
    const tick = (ts) => {
      if (ts - lastUpdate > 100) {
        const levels = live.getWaveformLevels(WAVE_BAR_COUNT);
        if (levels) setWaveBars(levels);
        lastUpdate = ts;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.isActive]);

  // Real elapsed-time counter for the live session, not a fabricated call
  // duration - starts at 0 the moment the operator actually starts
  // listening.
  useEffect(() => {
    if (!live.isActive) {
      setElapsedSeconds(0);
      return undefined;
    }
    const startedAt = Date.now();
    const id = setInterval(() => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(id);
  }, [live.isActive]);

  const toggleLiveTranscription = () => {
    if (live.isActive) {
      live.stop();
    } else {
      appendedSegmentCount.current = 0;
      live.start();
    }
  };

  // Release the mic if the operator navigates away mid-session, rather
  // than leaving it open in the background. Deliberately mount/unmount-only
  // (live.stop is a stable useCallback ref) - see FileComplaint.jsx's
  // identical pattern for its own mic-cleanup effect.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => live.stop(), []);

  useEffect(() => {
    api.get('/api/complaints?pageSize=50')
      .then((r) => {
        setComplaints(r.items);
        if (r.items[0]) setSelectedId(r.items[0].id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    api.get(`/api/complaints/${selectedId}`).then((d) => setNarrative(d.narrative || '')).catch(() => {});
  }, [selectedId]);

  const handleAudioFile = (file) => {
    setAudioFile(file);
    if (!file) { setAudioBase64(null); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      setAudioBase64(dataUrl.slice(dataUrl.indexOf(',') + 1));
    };
    reader.readAsDataURL(file);
  };

  const runAssessment = async ({ silent = false } = {}) => {
    if (!selectedId || !narrative.trim() || running) return;
    setRunning(true);
    if (!silent) { setError(''); setResult(null); }
    try {
      const complaint = await api.get(`/api/complaints/${selectedId}`);
      const res = await api.post('/api/assessments', {
        victimId: complaint.victimId,
        complaintId: complaint.id,
        caseId: complaint.case?.id,
        narrative: narrative.trim(),
        audioBase64: audioBase64 || undefined,
      });
      setResult(res.ai);
      if (silent) setError('');
    } catch (err) {
      // A transient failure during the live auto-refresh loop below
      // shouldn't interrupt an operator mid-call with a blocking error -
      // the manual Run Assessment button stays available either way, and
      // the last successful result stays on screen instead of being wiped.
      if (!silent) setError(err.body?.message || 'Assessment failed. Is the AI service running?');
    } finally {
      setRunning(false);
    }
  };

  // While listening, automatically re-run the real assessment on the
  // growing transcript each time a new segment finalizes (debounced) - this
  // is what makes the score bars, keyword tags, and SVI genuinely live
  // during a call, not just the transcript text. Reuses the exact same
  // /api/assessments call the manual button makes; no separate "live
  // scoring" backend exists or is needed.
  useEffect(() => {
    if (!live.isActive || !narrative.trim() || !selectedId) return undefined;
    const t = setTimeout(() => { runAssessment({ silent: true }); }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [narrative, live.isActive]);

  const svi = result?.svi;
  const emotion = result?.emotion;
  const selectedComplaint = complaints.find((c) => c.id === selectedId);

  const liveScoreBars = result ? [
    ['Trauma', result.nlp.traumaScore],
    ['Fear', result.nlp.fearScore],
    ['Threat', result.nlp.threatScore],
    ['Vulnerability', result.nlp.vulnerabilityScore],
  ] : [];

  const emotionTags = emotion ? Object.entries(emotion)
    .filter(([k]) => !['dominant_emotion', 'severity_index'].includes(k) && emotion[k] > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4) : [];

  return (
    <div className="tsa-fade">
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 4 }}>Real-Time Assessment</div>
        <div style={{ fontSize: 12, color: '#7d8399', marginBottom: 14 }}>
          Select a registered complaint, listen live or edit the transcript below, and run it through the real AI pipeline (voice DSP + explainable NLP/SVI/recommendation engines in the AI microservice).
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', color: '#eef0f6', fontSize: 12.5, padding: '8px 12px', borderRadius: 7, minWidth: 260 }}>
            {complaints.map((c) => (
              <option key={c.id} value={c.id} style={{ background: '#171a24' }}>{c.code} · {c.victimDisplayCode} · {c.district}</option>
            ))}
          </select>
          <button onClick={() => runAssessment()} disabled={running || !selectedId} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'oklch(0.65 0.14 200)', color: '#0d0f16', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            {running ? 'Running AI pipeline…' : 'Run Assessment'}
          </button>
          <button
            onClick={toggleLiveTranscription}
            style={{
              padding: '9px 16px', borderRadius: 8, border: live.isActive ? '1px solid oklch(0.7 0.17 55 / 0.5)' : '1px solid rgba(255,255,255,.15)',
              background: live.isActive ? 'oklch(0.7 0.17 55 / 0.15)' : 'rgba(255,255,255,.06)',
              color: live.isActive ? 'oklch(0.78 0.15 55)' : '#eef0f6', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {live.isActive ? '⏹ Stop Live Transcription' : '🎙 Start Live Transcription'}
          </button>
          <label style={{ fontSize: 11.5, color: '#8b91a3', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            Audio file:
            <input type="file" accept="audio/*" onChange={(e) => handleAudioFile(e.target.files?.[0] ?? null)} style={{ fontSize: 11.5, color: '#c4c8d4', maxWidth: 160 }} />
          </label>
          {audioFile && <span style={{ fontSize: 11.5, color: 'oklch(0.72 0.15 145)' }}>{audioFile.name} attached</span>}
        </div>
        {live.error && <div style={{ marginTop: 8, fontSize: 11.5, color: 'oklch(0.75 0.15 55)' }}>⚠ {live.error}</div>}
        {error && <div style={{ marginTop: 8, fontSize: 12, color: 'oklch(0.7 0.17 55)' }}>{error}</div>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '.8fr 1.2fr .9fr', gap: 16, marginBottom: 16 }}>
        {/* Column 1: real mic waveform (AnalyserNode-driven) while listening */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <span
              className={live.isActive ? 'tsa-pulse-dot' : undefined}
              style={{ width: 8, height: 8, borderRadius: '50%', background: live.isActive ? 'oklch(0.62 0.21 25)' : '#3a3f52' }}
            />
            <div style={{ font: '600 13px Sora,sans-serif' }}>{live.isActive ? 'Listening' : 'Live Audio Input'}</div>
          </div>
          <div style={{ fontSize: 12.5, color: '#8b91a3', marginBottom: 14 }}>
            {selectedComplaint ? `${selectedComplaint.code} · ${selectedComplaint.victimDisplayCode}` : 'No complaint selected'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 60, marginBottom: 12 }}>
            {waveBars.map((level, i) => (
              <div
                key={i}
                style={{
                  flex: 1, borderRadius: 2, transition: 'height .1s linear',
                  background: live.isActive ? 'oklch(0.65 0.14 200)' : 'rgba(255,255,255,.08)',
                  height: `${Math.max(6, level * 100)}%`,
                }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#7d8399' }}>
            <div>Duration: {formatDuration(elapsedSeconds)}</div>
            <div>{audioFile ? `File: ${audioFile.name}` : live.isActive ? 'Mic input' : 'No live audio'}</div>
          </div>
        </div>

        {/* Column 2: real live transcript (editable), real emotion/keyword tags from the latest assessment */}
        <div style={card}>
          <div style={{ font: '600 13px Sora,sans-serif', marginBottom: 12 }}>Live Speech-to-Text Transcript</div>
          <div style={{ position: 'relative', marginBottom: 14 }}>
            <textarea
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              rows={5}
              placeholder="Victim narrative / call transcript..."
              style={{ width: '100%', background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)', color: '#c4c8d4', borderRadius: 10, padding: 14, fontSize: 13, lineHeight: 1.7, resize: 'vertical' }}
            />
            {live.isActive && live.partialText && (
              <div style={{ marginTop: 6, fontSize: 12.5, color: '#8b91a3', fontStyle: 'italic' }}>
                {live.partialText}
                <span className="tsa-pulse-dot" style={{ display: 'inline-block', width: 7, height: 12, background: 'oklch(0.65 0.14 200)', marginLeft: 4, verticalAlign: 'middle' }} />
              </div>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: '#7d8399', marginBottom: 8 }}>
            {result ? 'Emotion detection (from latest assessment)' : 'Emotion detection'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14, minHeight: 26 }}>
            {emotionTags.length > 0 ? emotionTags.map(([label, val]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 20, background: 'oklch(0.7 0.15 25 / 0.12)', fontSize: 11.5, fontWeight: 600, color: 'oklch(0.75 0.16 25)', textTransform: 'capitalize' }}>
                <span className="tsa-pulse-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'oklch(0.75 0.16 25)' }} />
                {label} {val}%
              </div>
            )) : <div style={{ fontSize: 11.5, color: '#5c6178' }}>Run an assessment to see emotion detection.</div>}
          </div>
          <div style={{ fontSize: 11.5, color: '#7d8399', marginBottom: 8 }}>
            {result ? 'Keyword extraction (from latest assessment)' : 'Keyword extraction'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, minHeight: 26 }}>
            {result?.nlp.matchedKeywords.length > 0 ? result.nlp.matchedKeywords.slice(0, 10).map((kw) => (
              <div
                key={kw}
                style={{
                  padding: '6px 12px', borderRadius: 20, fontSize: 12,
                  background: result.nlp.nativeReviewMatchedTerms?.includes(kw) ? 'oklch(0.75 0.15 55 / 0.15)' : 'rgba(255,255,255,.05)',
                  border: '1px solid rgba(255,255,255,.08)',
                  color: result.nlp.nativeReviewMatchedTerms?.includes(kw) ? 'oklch(0.78 0.15 55)' : undefined,
                }}
              >
                {kw}
              </div>
            )) : <div style={{ fontSize: 11.5, color: '#5c6178' }}>Run an assessment to see matched keywords.</div>}
          </div>
        </div>

        {/* Column 3: real NLP score bars from the latest assessment */}
        <div style={card}>
          <div style={{ font: '600 13px Sora,sans-serif', marginBottom: 14 }}>Live AI Assessment</div>
          {result ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {liveScoreBars.map(([label, val]) => (
                <div key={label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                    <div style={{ color: '#c4c8d4' }}>{label}</div><div style={{ fontWeight: 600 }}>{val}</div>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,.06)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 3, background: 'oklch(0.65 0.14 200)', width: `${val}%`, transition: 'width .5s ease' }} />
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,.06)' }}>
                <div style={{ color: '#8b91a3' }}>Confidence Level</div><div style={{ fontWeight: 600, color: 'oklch(0.68 0.14 200)' }}>{result.nlp.confidence}%</div>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#5c6178', padding: '20px 0', textAlign: 'center' }}>Run an assessment to see real AI-computed scores.</div>
          )}
        </div>
      </div>

      {result?.transcript && (
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ font: '600 14px Sora,sans-serif' }}>Transcript Source</div>
            <TranscriptSourceBadge source={result.transcript.source} hasAudio={result.audioReceived} />
          </div>
          {result.transcript.language_detected && result.transcript.language_detected !== 'unknown' && (
            <div style={{ fontSize: 11, color: '#7d8399' }}>
              Language detected: {result.transcript.language_detected} &middot; Confidence {result.transcript.confidence}%
            </div>
          )}
        </div>
      )}

      {svi && (
        <>
          {svi.requiresPriorityReview && (
            <div style={{ ...card, marginBottom: 16, border: '1px solid oklch(0.7 0.17 55 / 0.4)', background: 'oklch(0.7 0.17 55 / 0.1)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ font: '700 13px Sora,sans-serif', color: 'oklch(0.78 0.15 55)' }}>🚩 PRIORITY REVIEW</div>
              <div style={{ fontSize: 12, color: '#c4c8d4' }}>
                Firsthand account (first-person language detected) of a {svi.band} severity case - a triage signal for fast human review, not a change to the score itself.
              </div>
            </div>
          )}

          <div style={{ ...card, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ font: '600 14px Sora,sans-serif' }}>Live Stress Vulnerability Index</div>
              <div style={{ font: '700 20px Sora,sans-serif', color: RISK_COLORS[svi.band] }}>{svi.value} &middot; {svi.band}</div>
            </div>
            <div style={{ height: 10, borderRadius: 5, background: 'linear-gradient(90deg,oklch(0.72 0.15 145),oklch(0.8 0.15 95),oklch(0.7 0.17 55),oklch(0.62 0.21 25))', position: 'relative', marginBottom: 18 }}>
              <div style={{ position: 'absolute', top: -5, width: 3, height: 20, background: '#fff', borderRadius: 2, left: `${svi.value}%`, transition: 'left .5s ease' }} />
            </div>
            <div style={{ fontSize: 11.5, color: '#7d8399', marginBottom: 10 }}>
              AI reasoning &middot; Model confidence {svi.confidence}% &middot; Escalation probability {svi.escalationProbability}% &middot; {svi.modelVersion}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
              {result.explanation.decisionPath.slice(0, 3).map((step, i) => (
                <div key={i} style={{ background: 'rgba(255,255,255,.03)', borderRadius: 10, padding: 12, fontSize: 12.5, color: '#c4c8d4', lineHeight: 1.5 }}>
                  {step}
                </div>
              ))}
            </div>
          </div>

          {result.voice && (
            <div style={{ ...card, marginBottom: 16 }}>
              <div style={{ font: '600 13px Sora,sans-serif', marginBottom: 2 }}>Voice DSP Output</div>
              <div style={{ fontSize: 11, color: '#7d8399', marginBottom: 12 }}>Real acoustic measurement via librosa (pYIN pitch) + Praat/parselmouth (jitter, shimmer, HNR) - not a trained clinical model.</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 16, marginBottom: 14 }}>
                {[
                  ['Voice Stress', `${result.voice.voiceStress} (${result.voice.voiceStressScore})`],
                  ['Speech Tremor', result.voice.speechTremor],
                  ['Pause Frequency', result.voice.pauseFrequency],
                  ['Fear Spikes', result.voice.fearIndicatorCount],
                  ['Confidence', `${result.voice.confidenceScore}%`],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div style={{ fontSize: 11, color: '#8b91a3', marginBottom: 4 }}>{label}</div>
                    <div style={{ font: '700 15px Sora,sans-serif' }}>{value}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,.06)' }}>
                {[
                  ['Jitter (local)', `${(result.voice.jitterLocal * 100).toFixed(2)}%`],
                  ['Shimmer (local)', `${(result.voice.shimmerLocal * 100).toFixed(2)}%`],
                  ['Harmonics-to-Noise', `${result.voice.hnrDb.toFixed(1)} dB`],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div style={{ fontSize: 11, color: '#8b91a3', marginBottom: 4 }}>{label}</div>
                    <div style={{ font: '700 15px Sora,sans-serif' }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ font: '600 12.5px Sora,sans-serif', color: '#7d8399', marginBottom: 12, marginTop: 4 }}>FULL ASSESSMENT DETAILS</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div style={card}>
              <div style={{ font: '600 13px Sora,sans-serif', marginBottom: 12 }}>NLP Indicators</div>
              {[['Trauma', result.nlp.traumaScore], ['Fear', result.nlp.fearScore], ['Threat', result.nlp.threatScore], ['Isolation', result.nlp.isolationScore], ['Hopelessness', result.nlp.hopelessnessScore]].map(([label, val]) => (
                <div key={label} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}><div>{label}</div><div style={{ fontWeight: 600 }}>{val}</div></div>
                  <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,.06)' }}><div style={{ height: '100%', borderRadius: 3, background: 'oklch(0.65 0.14 200)', width: `${val}%` }} /></div>
                </div>
              ))}
              {result.nlp.nativeReviewRecommended && (
                <div style={{ marginTop: 10, fontSize: 10.5, color: 'oklch(0.78 0.15 55)' }}>
                  ⚠ Depends on unreviewed-language lexicon terms - treat with extra scrutiny.
                </div>
              )}
              {(result.nlp.authorityContextDetected || result.nlp.victimTestimonyDetected) && (
                <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {result.nlp.authorityContextDetected && (
                    <span style={{ padding: '3px 8px', borderRadius: 12, background: 'oklch(0.7 0.17 55 / 0.15)', color: 'oklch(0.78 0.15 55)', fontSize: 10.5 }}>Authority power-imbalance detected (+8 SVI)</span>
                  )}
                  {result.nlp.victimTestimonyDetected && (
                    <span style={{ padding: '3px 8px', borderRadius: 12, background: 'rgba(255,255,255,.06)', fontSize: 10.5 }}>Firsthand testimony</span>
                  )}
                </div>
              )}
              {result.nlp.llmUnderstanding && (
                <div style={{ marginTop: 12, padding: 10, borderRadius: 10, background: result.nlp.llmUnderstanding.injectionSuspected ? 'oklch(0.7 0.17 55 / 0.1)' : 'oklch(0.65 0.14 200 / 0.08)', border: `1px solid ${result.nlp.llmUnderstanding.injectionSuspected ? 'oklch(0.7 0.17 55 / 0.35)' : 'oklch(0.65 0.14 200 / 0.25)'}` }}>
                  <div style={{ fontSize: 10.5, color: result.nlp.llmUnderstanding.injectionSuspected ? 'oklch(0.78 0.15 55)' : 'oklch(0.75 0.13 200)', fontWeight: 600, marginBottom: 4 }}>
                    LLM Narrative Understanding ({result.nlp.llmUnderstanding.model})
                  </div>
                  {result.nlp.llmUnderstanding.injectionSuspected && (
                    <div style={{ fontSize: 11, color: 'oklch(0.78 0.15 55)', marginBottom: 6 }}>
                      ⚠ This narrative may contain an attempt to manipulate the AI's scoring - treat this read with extra scrutiny, it was not automatically trusted or suppressed.
                    </div>
                  )}
                  <div style={{ fontSize: 11.5, color: '#c4c8d4', lineHeight: 1.5 }}>{result.nlp.llmUnderstanding.rationale}</div>
                </div>
              )}
              {result.nlp.semanticUnderstanding && (
                <div style={{ marginTop: 12, padding: 10, borderRadius: 10, background: 'oklch(0.65 0.14 200 / 0.08)', border: '1px solid oklch(0.65 0.14 200 / 0.25)' }}>
                  <div style={{ fontSize: 10.5, color: 'oklch(0.75 0.13 200)', fontWeight: 600, marginBottom: 4 }}>Semantic Match (free/local paraphrase detection)</div>
                  <div style={{ fontSize: 11.5, color: '#c4c8d4', lineHeight: 1.5 }}>
                    Closest reference match: "{Object.values(result.nlp.semanticUnderstanding.topMatches).sort((a, b) => b.similarity - a.similarity)[0]?.phrase}"
                  </div>
                </div>
              )}
            </div>
            <div style={card}>
              <div style={{ font: '600 13px Sora,sans-serif', marginBottom: 12 }}>Emotion Distribution</div>
              {Object.entries(emotion).filter(([k]) => !['dominant_emotion', 'severity_index'].includes(k)).map(([label, val]) => (
                <div key={label} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3, textTransform: 'capitalize' }}><div>{label}</div><div style={{ fontWeight: 600 }}>{val}%</div></div>
                  <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,.06)' }}><div style={{ height: '100%', borderRadius: 3, background: 'oklch(0.7 0.15 25)', width: `${val}%` }} /></div>
                </div>
              ))}
              <div style={{ marginTop: 8, fontSize: 11.5, color: '#8b91a3' }}>Dominant: <b style={{ color: '#eef0f6' }}>{emotion.dominant_emotion}</b></div>
            </div>
            <div style={card}>
              <div style={{ font: '600 13px Sora,sans-serif', marginBottom: 12 }}>Recommendations</div>
              {result.recommendations.slice(0, 6).map((r) => (
                <div key={r.type} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
                  <div>{r.type.replace(/_/g, ' ')}</div>
                  <div style={{ color: '#7d8399' }}>{r.confidence}%</div>
                </div>
              ))}
            </div>
          </div>

          <div style={card}>
            <div style={{ font: '600 13px Sora,sans-serif', marginBottom: 10 }}>AI Reasoning (Explainable AI)</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {result.explanation.reasonCodes.map((rc) => (
                <span key={rc} style={{ padding: '4px 10px', borderRadius: 20, background: 'rgba(255,255,255,.06)', fontSize: 11, fontFamily: "'IBM Plex Mono',monospace" }}>{rc}</span>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {result.explanation.decisionPath.map((step, i) => (
                <div key={i} style={{ fontSize: 12.5, color: '#c4c8d4' }}>{i + 1}. {step}</div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
