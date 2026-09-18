import { useEffect, useState } from 'react';
import { api } from '../lib/api';

const card = { background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 14, padding: 22 };
const STATUS_META = {
  scheduled: { bg: 'oklch(0.62 0.21 25 / 0.12)', color: 'oklch(0.75 0.18 25)' },
  completed: { bg: 'oklch(0.72 0.15 145 / 0.12)', color: 'oklch(0.72 0.15 145)' },
  cancelled: { bg: 'oklch(0.7 0.17 55 / 0.12)', color: 'oklch(0.7 0.17 55)' },
  no_show: { bg: 'oklch(0.7 0.17 55 / 0.12)', color: 'oklch(0.7 0.17 55)' },
};

function toPoints(values, w, h) {
  if (!values.length) return '';
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  return values.map((v, i) => {
    const x = values.length > 1 ? (i / (values.length - 1)) * w : w / 2;
    const y = h - ((v - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

export default function CounsellorWorkspace() {
  const [counsellors, setCounsellors] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/staff?role=COUNSELLOR')
      .then((r) => {
        setCounsellors(r);
        if (r[0]) setSelectedId(r[0].id);
        else setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    api.get(`/api/counselling/sessions?counsellorId=${selectedId}`)
      .then(setSessions)
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, [selectedId]);

  const scheduled = sessions.filter((s) => s.status === 'scheduled').length;
  const completed = sessions.filter((s) => s.status === 'completed').length;
  const wellbeingScores = sessions.filter((s) => s.wellbeingScore != null).sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)).map((s) => s.wellbeingScore);
  const avgWellbeing = wellbeingScores.length ? Math.round(wellbeingScores.reduce((a, b) => a + b, 0) / wellbeingScores.length) : null;

  return (
    <div className="tsa-fade">
      <select
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
        style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', color: '#eef0f6', fontSize: 12.5, padding: '8px 12px', borderRadius: 7, marginBottom: 16, minWidth: 240 }}
      >
        {counsellors.map((c) => <option key={c.id} value={c.id} style={{ background: '#171a24' }}>{c.fullName} - {c.department}</option>)}
      </select>

      {loading && <div style={{ color: '#7d8399', fontSize: 13 }}>Loading…</div>}

      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: '.9fr 1.1fr', gap: 16 }}>
          <div style={card}>
            <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 14 }}>Assigned Sessions</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {sessions.length === 0 && <div style={{ color: '#5c6178', fontSize: 12.5 }}>No sessions assigned to this counsellor.</div>}
              {sessions.map((s) => {
                const meta = STATUS_META[s.status] ?? STATUS_META.scheduled;
                return (
                  <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: 9, background: 'rgba(255,255,255,.03)' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{s.victim?.displayCode ?? 'Unknown'}</div>
                      <div style={{ fontSize: 11.5, color: '#8b91a3' }}>{s.mode} &middot; {new Date(s.scheduledAt).toLocaleString()}</div>
                    </div>
                    <div style={{ padding: '3px 9px', borderRadius: 20, fontSize: 11, background: meta.bg, color: meta.color }}>{s.status.replace(/_/g, ' ')}</div>
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={card}>
              <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 14 }}>Caseload Summary</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ font: '700 22px Sora,sans-serif', color: 'oklch(0.62 0.21 25)' }}>{scheduled}</div>
                  <div style={{ fontSize: 11, color: '#8b91a3' }}>Upcoming</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ font: '700 22px Sora,sans-serif', color: 'oklch(0.72 0.15 145)' }}>{completed}</div>
                  <div style={{ fontSize: 11, color: '#8b91a3' }}>Completed</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ font: '700 22px Sora,sans-serif' }}>{avgWellbeing ?? '—'}</div>
                  <div style={{ fontSize: 11, color: '#8b91a3' }}>Avg Wellbeing</div>
                </div>
              </div>
            </div>
            <div className="tsa-card-hover" style={card}>
              <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 14 }}>Wellbeing Score Across Completed Sessions</div>
              {wellbeingScores.length > 1 ? (
                <>
                  <svg viewBox="0 0 300 90" style={{ width: '100%', height: 90 }}>
                    <polyline points={toPoints(wellbeingScores, 300, 90)} fill="none" stroke="oklch(0.68 0.15 145)" strokeWidth="2.5" />
                  </svg>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#7d8399', marginTop: 8 }}>
                    <div>Earliest</div><div style={{ color: 'oklch(0.68 0.15 145)', fontWeight: 600 }}>{wellbeingScores.length} sessions with scores</div><div>Most recent</div>
                  </div>
                </>
              ) : (
                <div style={{ color: '#5c6178', fontSize: 12.5 }}>Not enough completed sessions with wellbeing scores yet.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
