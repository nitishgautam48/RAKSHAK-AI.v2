import { useEffect, useState } from 'react';
import { api } from '../lib/api';

const EVENT_COLOR = {
  status_change: 'oklch(0.65 0.14 200)',
  note: '#8b91a3',
  assignment: 'oklch(0.8 0.15 95)',
  ai_assessment: 'oklch(0.7 0.17 55)',
  document: 'oklch(0.58 0.19 275)',
  legal: 'oklch(0.62 0.21 25)',
  counselling: 'oklch(0.72 0.15 145)',
};

export default function CaseTimeline() {
  const [kase, setKase] = useState(null);
  const [noCase, setNoCase] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/cases/mine')
      .then(setKase)
      .catch((e) => { if (e.status === 404) setNoCase(true); })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="tsa-fade">
      <div style={{ font: '700 20px Sora,sans-serif', marginBottom: 18 }}>My Case Timeline</div>

      {loading && <div style={{ color: '#7d8399', fontSize: 13.5 }}>Loading…</div>}

      {!loading && noCase && (
        <div style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 16, padding: 18, color: '#8b91a3', fontSize: 13.5 }}>
          Your complaint has not been opened as a case yet. Once an officer begins reviewing it, its progress will appear here.
        </div>
      )}

      {!loading && kase && (
        <>
          <div style={{ fontSize: 13, color: '#8b91a3', marginBottom: 16 }}>
            {kase.caseNumber} &middot; {kase.status.replace(/_/g, ' ')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {kase.timeline.length === 0 && (
              <div style={{ color: '#8b91a3', fontSize: 13.5 }}>No updates recorded yet.</div>
            )}
            {[...kase.timeline].reverse().map((t, i) => {
              const color = EVENT_COLOR[t.eventType] ?? '#5c6178';
              return (
                <div key={t.id} style={{ display: 'flex', gap: 14 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: 16, height: 16, borderRadius: '50%', background: color, flex: 'none' }} />
                    {i < kase.timeline.length - 1 && <div style={{ width: 2, flex: 1, background: 'rgba(255,255,255,.08)', minHeight: 30 }} />}
                  </div>
                  <div style={{ paddingBottom: 20 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{t.summary}</div>
                    <div style={{ fontSize: 12, color: '#8b91a3' }}>{new Date(t.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
