import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';

const card = { background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 14, padding: 22 };
const STATUS_COLOR = { OPEN: 'oklch(0.62 0.21 25)', ACKNOWLEDGED: 'oklch(0.7 0.17 55)', DISPATCHED: 'oklch(0.65 0.14 200)', RESOLVED: 'oklch(0.72 0.15 145)' };
const NEXT_STATUS = { OPEN: 'ACKNOWLEDGED', ACKNOWLEDGED: 'DISPATCHED', DISPATCHED: 'RESOLVED' };

export default function EmergencyCenter() {
  const [items, setItems] = useState([]);
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    api.get('/api/sos').then(setItems).catch(() => setItems([])).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onNew = (sos) => {
      setItems((prev) => [sos, ...prev]);
      setFeed((f) => [{ text: `New SOS received${sos.district ? ` in ${sos.district}` : ''}`, time: 'just now', id: Math.random() }, ...f].slice(0, 10));
    };
    const onUpdate = (sos) => {
      setItems((prev) => prev.map((s) => (s.id === sos.id ? sos : s)));
      setFeed((f) => [{ text: `SOS ${sos.id.slice(-6)} marked ${sos.status}`, time: 'just now', id: Math.random() }, ...f].slice(0, 10));
    };
    socket.on('sos:new', onNew);
    socket.on('sos:update', onUpdate);
    return () => { socket.off('sos:new', onNew); socket.off('sos:update', onUpdate); };
  }, []);

  const advance = async (sos) => {
    const next = NEXT_STATUS[sos.status];
    if (!next) return;
    const updated = await api.patch(`/api/sos/${sos.id}/status`, { status: next });
    setItems((prev) => prev.map((s) => (s.id === sos.id ? updated : s)));
  };

  const openCount = items.filter((s) => s.status !== 'RESOLVED').length;

  return (
    <div className="tsa-fade">
      <div style={{ marginBottom: 16, fontSize: 12.5, color: '#8b91a3' }}>
        {openCount} open SOS alert{openCount === 1 ? '' : 's'} &middot; real-time via Socket.IO - trigger one from the Survivor Portal's emergency bypass to see it appear here instantly.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={card}>
          <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 14 }}>SOS Requests</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {loading && <div style={{ color: '#7d8399', fontSize: 12.5 }}>Loading…</div>}
            {!loading && items.length === 0 && <div style={{ color: '#7d8399', fontSize: 12.5 }}>No SOS requests recorded.</div>}
            {items.map((sos) => (
              <div key={sos.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderRadius: 10, background: 'oklch(0.25 0.06 25 / 0.15)', border: '1px solid oklch(0.5 0.15 25 / 0.25)' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{sos.district || 'Unknown location'}{sos.state ? `, ${sos.state}` : ''}</div>
                  <div style={{ fontSize: 11.5, color: '#8b91a3' }}>{new Date(sos.createdAt).toLocaleString()}{sos.notes ? ` · ${sos.notes}` : ''}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20, background: STATUS_COLOR[sos.status], color: '#0d0f16', fontWeight: 600 }}>{sos.status}</div>
                  {NEXT_STATUS[sos.status] && (
                    <button onClick={() => advance(sos)} style={{ fontSize: 11, padding: '5px 10px', borderRadius: 7, border: '1px solid rgba(255,255,255,.15)', background: 'rgba(255,255,255,.05)', color: '#eef0f6', cursor: 'pointer' }}>
                      Mark {NEXT_STATUS[sos.status]}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={card}>
          <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 14 }}>Live Actions Feed</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {feed.length === 0 && <div style={{ fontSize: 12.5, color: '#5c6178' }}>No live activity yet this session.</div>}
            {feed.map((rt) => (
              <div key={rt.id} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'oklch(0.62 0.21 25)', marginTop: 5, flex: 'none' }} />
                <div>
                  <div style={{ fontSize: 12.5 }}>{rt.text}</div>
                  <div style={{ fontSize: 11, color: '#5c6178' }}>{rt.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
