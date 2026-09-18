import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import ComplaintSelector from '../components/ComplaintSelector';

const EVENT_COLOR = {
  status_change: 'oklch(0.65 0.14 200)',
  note: '#8b91a3',
  assignment: 'oklch(0.8 0.15 95)',
  ai_assessment: 'oklch(0.7 0.17 55)',
  document: 'oklch(0.58 0.19 275)',
  legal: 'oklch(0.62 0.21 25)',
  counselling: 'oklch(0.72 0.15 145)',
};

export default function VictimJourneyTimeline() {
  const [complaints, setComplaints] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [kase, setKase] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/complaints?pageSize=50')
      .then((r) => {
        setComplaints(r.items);
        if (r.items[0]) setSelectedId(r.items[0].id);
        else setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    api.get(`/api/complaints/${selectedId}`)
      .then((c) => (c.case ? api.get(`/api/cases/${c.case.id}`).then(setKase) : setKase(null)))
      .catch(() => setKase(null))
      .finally(() => setLoading(false));
  }, [selectedId]);

  return (
    <div className="tsa-fade">
      <ComplaintSelector complaints={complaints} selectedId={selectedId} onChange={setSelectedId} />
      {loading && <div style={{ color: '#7d8399', fontSize: 13 }}>Loading…</div>}

      {!loading && !kase && (
        <div style={{ background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 14, padding: 26, color: '#7d8399' }}>
          This complaint has no case opened yet, so there is no journey to show.
        </div>
      )}

      {!loading && kase && (
        <div style={{ background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 14, padding: 26, maxWidth: 720 }}>
          <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 4 }}>{kase.victim.displayCode} &middot; {kase.caseNumber}</div>
          <div style={{ fontSize: 12, color: '#7d8399', marginBottom: 22 }}>Status: {kase.status.replace(/_/g, ' ')} &middot; Opened {new Date(kase.openedAt).toLocaleDateString()}</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {kase.timeline.length === 0 && <div style={{ color: '#5c6178', fontSize: 12.5 }}>No timeline events recorded yet.</div>}
            {[...kase.timeline].reverse().map((t, i) => {
              const color = EVENT_COLOR[t.eventType] ?? '#5c6178';
              return (
                <div key={t.id} style={{ display: 'flex', gap: 16 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: 14, height: 14, borderRadius: '50%', background: color, flex: 'none' }} />
                    {i < kase.timeline.length - 1 && <div style={{ width: 2, flex: 1, background: 'rgba(255,255,255,.08)', minHeight: 34 }} />}
                  </div>
                  <div style={{ paddingBottom: 22 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 3 }}>{t.summary}</div>
                    <div style={{ fontSize: 11.5, color: '#8b91a3' }}>{t.actor?.fullName ?? 'System'} &middot; {new Date(t.createdAt).toLocaleString()}</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color, marginTop: 3, textTransform: 'capitalize' }}>{t.eventType.replace(/_/g, ' ')}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
