import { useEffect, useState } from 'react';
import { useAssessmentSelector } from '../lib/useAssessmentSelector';
import ComplaintSelector from '../components/ComplaintSelector';
import { api } from '../lib/api';

const card = { background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 14, padding: 20 };
const RISK_COLORS = { LOW: 'oklch(0.72 0.15 145)', MODERATE: 'oklch(0.8 0.15 95)', HIGH: 'oklch(0.7 0.17 55)', CRITICAL: 'oklch(0.62 0.21 25)' };
const BANDS = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'];

export default function ExplainableAi() {
  const { complaints, selectedId, setSelectedId, complaint, assessment, explanation, loading } = useAssessmentSelector();
  const svi = assessment?.sviScore;
  const maxContribution = explanation ? Math.max(...explanation.features.map((f) => f.contributionPct), 1) : 1;

  const [reviews, setReviews] = useState([]);
  const [overrideBand, setOverrideBand] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setReviews(assessment?.reviews ?? []);
    setOverrideBand('');
    setNote('');
  }, [assessment]);

  const submitReview = async (action) => {
    if (submitting || !assessment) return;
    if (action === 'OVERRIDDEN' && !overrideBand) return;
    setSubmitting(true);
    try {
      const review = await api.post(`/api/assessments/${assessment.id}/review`, {
        action,
        overriddenBand: action === 'OVERRIDDEN' ? overrideBand : undefined,
        note: note.trim() || undefined,
      });
      setReviews((r) => [review, ...r]);
      setOverrideBand('');
      setNote('');
    } catch {
      // eslint-disable-next-line no-alert
      alert('Could not save this review.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="tsa-fade">
      <ComplaintSelector complaints={complaints} selectedId={selectedId} onChange={setSelectedId} />
      {loading && <div style={{ color: '#7d8399', fontSize: 13 }}>Loading…</div>}

      {!loading && complaint && !explanation && (
        <div style={{ ...card, textAlign: 'center', color: '#7d8399' }}>No AI assessment has been run for this complaint yet. Submit one from Real-Time Assessment.</div>
      )}

      {!loading && complaint && explanation && svi && (
        <div style={{ display: 'grid', gridTemplateColumns: '.7fr 1.1fr .8fr', gap: 16 }}>
          <div style={card}>
            <div style={{ font: '600 13px Sora,sans-serif', marginBottom: 14 }}>Case Summary</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, fontSize: 12.5 }}>
              <div><span style={{ color: '#7d8399' }}>Case:</span> {complaint.victim.displayCode}</div>
              <div><span style={{ color: '#7d8399' }}>District:</span> {complaint.district}</div>
              <div><span style={{ color: '#7d8399' }}>Incident:</span> {complaint.incidentType}</div>
              <div><span style={{ color: '#7d8399' }}>Final Risk:</span> <span style={{ color: RISK_COLORS[svi.band], fontWeight: 600 }}>{svi.band}</span></div>
              <div><span style={{ color: '#7d8399' }}>SVI Value:</span> <span style={{ fontWeight: 600 }}>{svi.value}</span></div>
              <div><span style={{ color: '#7d8399' }}>Model Version:</span> <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11 }}>{svi.modelVersion}</span></div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={card}>
              <div style={{ font: '600 13px Sora,sans-serif', marginBottom: 2 }}>Feature Contribution (exact linear decomposition)</div>
              <div style={{ fontSize: 11, color: '#7d8399', marginBottom: 12 }}>Each dimension's exact contribution to the SVI value - not an approximation of a black box.</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {explanation.features.map((f) => (
                  <div key={f.label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 4 }}>
                      <div style={{ color: '#c4c8d4' }}>{f.label} <span style={{ color: '#5c6178' }}>(raw {f.rawValue}, weight {f.weight})</span></div>
                      <div style={{ fontWeight: 600, color: 'oklch(0.65 0.14 200)' }}>+{f.contributionPct}</div>
                    </div>
                    <div style={{ height: 7, borderRadius: 4, background: 'rgba(255,255,255,.05)' }}>
                      <div style={{ height: '100%', borderRadius: 4, background: 'oklch(0.65 0.14 200)', width: `${(100 * f.contributionPct) / maxContribution}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div style={card}>
              <div style={{ font: '600 13px Sora,sans-serif', marginBottom: 14 }}>AI Decision Path</div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {explanation.decisionPath.map((label, i) => (
                  <div key={label}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'oklch(0.65 0.14 200)', flex: 'none' }} />
                      <div style={{ fontSize: 13 }}>{label}</div>
                    </div>
                    {i < explanation.decisionPath.length - 1 && <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,.1)', marginLeft: 3.5 }} />}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div style={card}>
            <div style={{ font: '600 13px Sora,sans-serif', marginBottom: 12 }}>Explainability Summary</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,.06)', marginBottom: 8 }}>
              <div style={{ color: '#8b91a3' }}>Model Confidence</div><div style={{ fontWeight: 600, color: 'oklch(0.68 0.14 200)' }}>{explanation.confidence}%</div>
            </div>
            <div style={{ fontSize: 11.5, color: '#7d8399', marginBottom: 6, marginTop: 12 }}>Reason Codes</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {explanation.reasonCodes.map((rc) => (
                <div key={rc} style={{ padding: '4px 10px', borderRadius: 20, background: 'rgba(255,255,255,.06)', fontSize: 11, fontFamily: "'IBM Plex Mono',monospace" }}>{rc}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!loading && complaint && explanation && svi && (
        <div style={{ ...card, marginTop: 16 }}>
          <div style={{ font: '600 13px Sora,sans-serif', marginBottom: 2 }}>Human Review</div>
          <div style={{ fontSize: 11, color: '#7d8399', marginBottom: 14 }}>
            Confirm or override this AI judgment. This is the real mechanism for validating the scoring formulas against genuine field
            judgment over time - the illustrative evaluation harness on AI Model Monitoring is self-written and cannot substitute for this.
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 14 }}>
            <button
              onClick={() => submitReview('CONFIRMED')}
              disabled={submitting}
              style={{ padding: '10px 18px', borderRadius: 9, border: 'none', background: 'oklch(0.72 0.15 145)', color: '#0d0f16', font: '700 13px Sora,sans-serif', cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}
            >
              Confirm {svi.band}
            </button>
            <select value={overrideBand} onChange={(e) => setOverrideBand(e.target.value)} style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', color: '#eef0f6', fontSize: 12.5, padding: '10px 12px', borderRadius: 9 }}>
              <option value="" style={{ background: '#171a24' }}>Override to…</option>
              {BANDS.map((b) => <option key={b} value={b} style={{ background: '#171a24' }}>{b}</option>)}
            </select>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note (why you agree or disagree)"
              style={{ flex: 1, minWidth: 200, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', color: '#eef0f6', fontSize: 12.5, padding: '10px 12px', borderRadius: 9 }}
            />
            <button
              onClick={() => submitReview('OVERRIDDEN')}
              disabled={submitting || !overrideBand}
              style={{ padding: '10px 18px', borderRadius: 9, border: '1px solid oklch(0.7 0.17 55 / 0.4)', background: 'oklch(0.7 0.17 55 / 0.12)', color: 'oklch(0.78 0.15 55)', font: '700 13px Sora,sans-serif', cursor: 'pointer', opacity: submitting || !overrideBand ? 0.5 : 1 }}
            >
              Submit Override
            </button>
          </div>

          {reviews.length === 0 && <div style={{ color: '#5c6178', fontSize: 12.5 }}>No reviews recorded yet for this assessment.</div>}
          {reviews.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {reviews.map((r) => (
                <div key={r.id} style={{ display: 'flex', gap: 14, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,.05)', fontSize: 12 }}>
                  <div style={{ width: 130, color: '#5c6178' }}>{new Date(r.createdAt).toLocaleString()}</div>
                  <div style={{ width: 140, color: '#8b91a3' }}>{r.reviewer?.fullName ?? 'Reviewer'}</div>
                  <div style={{ width: 90, fontWeight: 600, color: r.action === 'CONFIRMED' ? 'oklch(0.72 0.15 145)' : 'oklch(0.7 0.17 55)' }}>
                    {r.action === 'CONFIRMED' ? 'Confirmed' : `→ ${r.overriddenBand}`}
                  </div>
                  <div style={{ flex: 1, color: '#c4c8d4' }}>{r.note}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
