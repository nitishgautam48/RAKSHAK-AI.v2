import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { WELLNESS_RESOURCES } from '../data/constants';

const STATUS_META = {
  scheduled: { bg: 'oklch(0.62 0.21 25 / 0.15)', color: 'oklch(0.75 0.18 25)' },
  completed: { bg: 'oklch(0.72 0.15 145 / 0.15)', color: 'oklch(0.72 0.15 145)' },
  cancelled: { bg: 'oklch(0.7 0.17 55 / 0.15)', color: 'oklch(0.7 0.17 55)' },
  no_show: { bg: 'oklch(0.7 0.17 55 / 0.15)', color: 'oklch(0.7 0.17 55)' },
};

export default function CounsellingCenter() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/counselling/sessions').then(setSessions).catch(() => setSessions([])).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;
    const refresh = () => api.get('/api/counselling/sessions').then(setSessions).catch(() => {});
    socket.on('counselling:update', refresh);
    return () => socket.off('counselling:update', refresh);
  }, []);

  const upcoming = sessions
    .filter((s) => s.status === 'scheduled')
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))[0];
  const past = sessions
    .filter((s) => s.id !== upcoming?.id)
    .sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt));

  return (
    <div className="tsa-fade" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ font: '700 20px Sora,sans-serif' }}>Counselling Center</div>

      {loading && <div style={{ color: '#8b91a3', fontSize: 13.5 }}>Loading…</div>}

      {!loading && upcoming && (
        <div style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 16, padding: 18 }}>
          <div style={{ fontSize: 12, color: '#7d8399', marginBottom: 6 }}>Next Session</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
            {new Date(upcoming.scheduledAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} &middot; {new Date(upcoming.scheduledAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
          </div>
          <div style={{ fontSize: 13, color: '#8b91a3', marginBottom: 14 }}>With {upcoming.counsellor?.fullName ?? 'your counsellor'} &middot; {upcoming.mode.replace('_', ' ')}</div>
          {upcoming.mode === 'video' && (
            <button style={{ width: '100%', padding: 14, borderRadius: 10, border: 'none', background: 'oklch(0.65 0.14 200)', color: '#0d0f16', font: '700 14px Sora,sans-serif', cursor: 'pointer' }}>Join Video Session</button>
          )}
        </div>
      )}

      {!loading && !upcoming && (
        <div style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 16, padding: 18, color: '#8b91a3', fontSize: 13.5 }}>
          No upcoming session scheduled. Your counsellor will reach out once one is arranged.
        </div>
      )}

      {!loading && past.length > 0 && (
        <div>
          <div style={{ fontSize: 13, color: '#8b91a3', marginBottom: 10 }}>Session History</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {past.map((s) => {
              const meta = STATUS_META[s.status] ?? STATUS_META.scheduled;
              return (
                <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderRadius: 12, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)' }}>
                  <div>
                    <div style={{ fontSize: 13.5 }}>{new Date(s.scheduledAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                    <div style={{ fontSize: 11.5, color: '#7d8399' }}>{s.counsellor?.fullName ?? 'Counsellor'} &middot; {s.mode.replace('_', ' ')}</div>
                  </div>
                  <div style={{ padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: meta.bg, color: meta.color }}>{s.status.replace('_', ' ')}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <div style={{ fontSize: 13, color: '#8b91a3', marginBottom: 10 }}>Wellness Resources</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {WELLNESS_RESOURCES.map((wr) => (
            <div key={wr.title} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderRadius: 12, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)' }}>
              <div style={{ fontSize: 13.5 }}>{wr.title}</div>
              <div style={{ fontSize: 11, color: '#7d8399' }}>{wr.type}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
