import { useEffect, useState } from 'react';
import { IVRS_STEPS } from '../data/constants';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';

const card = { background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 14, padding: 22 };
const CHANNEL_LABELS = { helpline: 'Helpline (14566)', portal: 'Survivor Portal', 'field-visit': 'Field Visit' };
const CHANNEL_COLORS = { helpline: 'oklch(0.65 0.14 200)', portal: 'oklch(0.72 0.15 145)', 'field-visit': 'oklch(0.8 0.15 95)' };

export default function ChannelMonitoring() {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = () => api.get('/api/analytics/channel-breakdown').then(setChannels).catch(() => {}).finally(() => setLoading(false));

  useEffect(() => { reload(); }, []);

  // A new complaint on any channel shifts this breakdown immediately.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;
    socket.on('complaint:new', reload);
    return () => socket.off('complaint:new', reload);
  }, []);

  const total = channels.reduce((a, c) => a + c.count, 0) || 1;
  const max = channels.length ? Math.max(...channels.map((c) => c.count), 1) : 1;

  let cumulative = 0;
  const gradientStops = channels.map((c) => {
    const start = (100 * cumulative) / total;
    cumulative += c.count;
    const end = (100 * cumulative) / total;
    return `${CHANNEL_COLORS[c.channel] ?? '#5c6178'} ${start.toFixed(1)}% ${end.toFixed(1)}%`;
  });
  const donutGradient = gradientStops.length ? `conic-gradient(${gradientStops.join(', ')})` : 'rgba(255,255,255,.06)';

  return (
    <div className="tsa-fade">
      {loading && <div style={{ color: '#7d8399', fontSize: 13, marginBottom: 16 }}>Loading…</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14, marginBottom: 16 }}>
        {channels.map((c) => (
          <div key={c.channel} style={{ background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 11.5, color: '#8b91a3', marginBottom: 8 }}>{CHANNEL_LABELS[c.channel] ?? c.channel}</div>
            <div style={{ font: '700 22px Sora,sans-serif' }}>{c.count}</div>
            <div style={{ fontSize: 11, color: CHANNEL_COLORS[c.channel] ?? '#8b91a3' }}>{Math.round((100 * c.count) / total)}% of volume</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div style={card}>
          <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 16 }}>Channel Volume Comparison</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, height: 110 }}>
            {channels.map((c) => (
              <div key={c.channel} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, justifyContent: 'flex-end', height: '100%' }}>
                <div style={{ width: '100%', borderRadius: '4px 4px 0 0', background: CHANNEL_COLORS[c.channel] ?? '#5c6178', height: `${Math.max(4, (100 * c.count) / max)}%` }} />
                <div style={{ fontSize: 10.5, color: '#7d8399' }}>{CHANNEL_LABELS[c.channel] ?? c.channel}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ ...card, display: 'flex', gap: 20, alignItems: 'center' }}>
          <div style={{ width: 120, height: 120, borderRadius: '50%', background: donutGradient, flex: 'none' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {channels.map((c) => (
              <div key={c.channel} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: CHANNEL_COLORS[c.channel] ?? '#5c6178' }} />{CHANNEL_LABELS[c.channel] ?? c.channel}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 16, alignItems: 'start' }}>
        <div style={{ width: 200, background: '#000', borderRadius: 24, padding: 10, border: '4px solid #2a2e3d' }}>
          <div style={{ background: '#0d0f16', borderRadius: 16, padding: 14, minHeight: 280 }}>
            <div style={{ fontSize: 10.5, color: '#5c6178', textAlign: 'center', marginBottom: 10 }}>TraumaSense Mobile</div>
            <div style={{ fontSize: 11, color: '#7d8399', textAlign: 'center', fontFamily: "'IBM Plex Mono',monospace", border: '1px dashed rgba(255,255,255,.15)', borderRadius: 8, padding: '30px 10px' }}>mobile report screen placeholder</div>
          </div>
        </div>
        <div style={card}>
          <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 4 }}>IVRS Workflow</div>
          <div style={{ fontSize: 11, color: '#5c6178', marginBottom: 12 }}>Standard call-routing process for the 14566 helpline</div>
          <div className="tsa-scroll" style={{ display: 'flex', overflowX: 'auto' }}>
            {IVRS_STEPS.map((iv) => (
              <div key={iv.n} style={{ display: 'flex', alignItems: 'center', flex: 'none' }}>
                <div style={{ width: 120, textAlign: 'center' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: 'linear-gradient(135deg,oklch(0.3 0.06 275),oklch(0.24 0.04 235))', border: '1px solid rgba(255,255,255,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px', font: '700 13px Sora,sans-serif', color: 'oklch(0.75 0.13 200)' }}>{iv.n}</div>
                  <div style={{ fontSize: 11.5 }}>{iv.label}</div>
                </div>
                {iv.hasArrow && <div style={{ width: 24, height: 1, background: 'rgba(255,255,255,.15)', flex: 'none' }} />}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
