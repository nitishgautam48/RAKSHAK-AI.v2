import { useEffect, useState } from 'react';
import { api } from '../lib/api';

const card = { background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 14, padding: 20 };
// Keyed to the backend's RiskLevel enum (LOW/MODERATE/HIGH/CRITICAL), not
// the Capitalized keys in data/constants.js's mock-data RISK_COLORS.
const RISK_COLORS = { LOW: 'oklch(0.72 0.15 145)', MODERATE: 'oklch(0.8 0.15 95)', HIGH: 'oklch(0.7 0.17 55)', CRITICAL: 'oklch(0.62 0.21 25)' };

export default function RealTimeAssessment() {
  const [complaints, setComplaints] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [narrative, setNarrative] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [audioFile, setAudioFile] = useState(null);
  const [audioBase64, setAudioBase64] = useState(null);

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

  const runAssessment = async () => {
    if (!selectedId || !narrative.trim()) return;
    setRunning(true);
    setError('');
    setResult(null);
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
    } catch (err) {
      setError(err.body?.message || 'Assessment failed. Is the AI service running?');
    } finally {
      setRunning(false);
    }
  };

  const svi = result?.svi;
  const emotion = result?.emotion;

  return (
    <div className="tsa-fade">
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 4 }}>Live AI Assessment</div>
        <div style={{ fontSize: 12, color: '#7d8399', marginBottom: 14 }}>
          Select a registered complaint, review or edit the narrative, and run it through the real AI pipeline (voice DSP + explainable NLP/SVI/recommendation engines in the AI microservice).
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', color: '#eef0f6', fontSize: 12.5, padding: '8px 12px', borderRadius: 7, minWidth: 260 }}>
            {complaints.map((c) => (
              <option key={c.id} value={c.id} style={{ background: '#171a24' }}>{c.code} · {c.victimDisplayCode} · {c.district}</option>
            ))}
          </select>
          <button onClick={runAssessment} disabled={running || !selectedId} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'oklch(0.65 0.14 200)', color: '#0d0f16', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            {running ? 'Running AI pipeline…' : 'Run Assessment'}
          </button>
        </div>
        <textarea
          value={narrative}
          onChange={(e) => setNarrative(e.target.value)}
          rows={4}
          placeholder="Victim narrative / call transcript..."
          style={{ width: '100%', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)', color: '#eef0f6', borderRadius: 10, padding: 12, fontSize: 13, lineHeight: 1.6, resize: 'vertical' }}
        />
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, color: '#8b91a3' }}>
            Optional audio (WAV/FLAC/OGG - real pitch/energy/pause DSP, no model download needed):
          </label>
          <input type="file" accept="audio/*" onChange={(e) => handleAudioFile(e.target.files?.[0] ?? null)} style={{ fontSize: 12, color: '#c4c8d4' }} />
          {audioFile && <span style={{ fontSize: 11.5, color: 'oklch(0.72 0.15 145)' }}>{audioFile.name} attached</span>}
        </div>
        {error && <div style={{ marginTop: 10, fontSize: 12, color: 'oklch(0.7 0.17 55)' }}>{error}</div>}
      </div>

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
              <div style={{ font: '600 14px Sora,sans-serif' }}>Stress Vulnerability Index</div>
              <div style={{ font: '700 22px Sora,sans-serif', color: RISK_COLORS[svi.band] }}>{svi.value} &middot; {svi.band}</div>
            </div>
            <div style={{ height: 10, borderRadius: 5, background: 'linear-gradient(90deg,oklch(0.72 0.15 145),oklch(0.8 0.15 95),oklch(0.7 0.17 55),oklch(0.62 0.21 25))', position: 'relative', marginBottom: 10 }}>
              <div style={{ position: 'absolute', top: -5, width: 3, height: 20, background: '#fff', borderRadius: 2, left: `${svi.value}%` }} />
            </div>
            <div style={{ fontSize: 12, color: '#8b91a3' }}>Model confidence {svi.confidence}% &middot; Escalation probability {svi.escalationProbability}% &middot; {svi.modelVersion}</div>
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div style={card}>
              <div style={{ font: '600 13px Sora,sans-serif', marginBottom: 12 }}>NLP Indicators</div>
              {[['Trauma', result.nlp.traumaScore], ['Fear', result.nlp.fearScore], ['Threat', result.nlp.threatScore], ['Isolation', result.nlp.isolationScore], ['Hopelessness', result.nlp.hopelessnessScore]].map(([label, val]) => (
                <div key={label} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}><div>{label}</div><div style={{ fontWeight: 600 }}>{val}</div></div>
                  <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,.06)' }}><div style={{ height: '100%', borderRadius: 3, background: 'oklch(0.65 0.14 200)', width: `${val}%` }} /></div>
                </div>
              ))}
              {result.nlp.matchedKeywords.length > 0 && (
                <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {result.nlp.matchedKeywords.map((k) => (
                    <span
                      key={k}
                      style={{
                        padding: '3px 8px', borderRadius: 12, fontSize: 10.5,
                        background: result.nlp.nativeReviewMatchedTerms?.includes(k) ? 'oklch(0.75 0.15 55 / 0.15)' : 'rgba(255,255,255,.06)',
                        color: result.nlp.nativeReviewMatchedTerms?.includes(k) ? 'oklch(0.78 0.15 55)' : undefined,
                      }}
                    >
                      {k}
                    </span>
                  ))}
                </div>
              )}
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

      {!svi && !running && (
        <div style={{ ...card, textAlign: 'center', color: '#7d8399', padding: 40 }}>
          Select a complaint and click "Run Assessment" to see real AI-computed results.
        </div>
      )}
    </div>
  );
}
