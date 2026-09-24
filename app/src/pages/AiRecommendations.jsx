import { useEffect, useState } from 'react';
import Hoverable from '../components/Hoverable';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';

const TYPE_OPTIONS = ['All Types', 'COUNSELLING', 'MEDICAL_AID', 'POLICE_PROTECTION', 'WITNESS_PROTECTION', 'LEGAL_AID', 'COMPENSATION_SUPPORT', 'SHELTER_SUPPORT', 'REHABILITATION_SUPPORT'];
const RISK_COLORS = { LOW: 'oklch(0.72 0.15 145)', MODERATE: 'oklch(0.8 0.15 95)', HIGH: 'oklch(0.7 0.17 55)', CRITICAL: 'oklch(0.62 0.21 25)' };
const RISK_BG = { LOW: 'oklch(0.72 0.15 145 / 0.15)', MODERATE: 'oklch(0.8 0.15 95 / 0.15)', HIGH: 'oklch(0.7 0.17 55 / 0.15)', CRITICAL: 'oklch(0.62 0.21 25 / 0.15)' };

export default function AiRecommendations() {
  const [type, setType] = useState('All Types');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = type !== 'All Types' ? `?type=${type}&pageSize=40` : '?pageSize=40';
    api.get(`/api/recommendations${params}`)
      .then((r) => setItems(r.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [type]);

  // Recommendations are generated per assessment - a new one anywhere adds
  // rows this list was previously blind to until the officer changed the
  // type filter (which happened to re-trigger the effect above) or reloaded.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;
    const refresh = () => {
      const params = type !== 'All Types' ? `?type=${type}&pageSize=40` : '?pageSize=40';
      api.get(`/api/recommendations${params}`).then((r) => setItems(r.items)).catch(() => {});
    };
    socket.on('assessment:new', refresh);
    return () => socket.off('assessment:new', refresh);
  }, [type]);

  return (
    <div className="tsa-fade">
      <select
        value={type}
        onChange={(e) => setType(e.target.value)}
        style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', color: '#eef0f6', fontSize: 12.5, padding: '8px 12px', borderRadius: 7, marginBottom: 16 }}
      >
        {TYPE_OPTIONS.map((t) => <option key={t} value={t} style={{ background: '#171a24' }}>{t.replace(/_/g, ' ')}</option>)}
      </select>

      {loading && <div style={{ color: '#7d8399', fontSize: 13 }}>Loading…</div>}
      {!loading && items.length === 0 && <div style={{ color: '#7d8399', fontSize: 13 }}>No recommendations yet - run an assessment from Real-Time Assessment.</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 14 }}>
        {items.map((rec) => (
          <Hoverable
            key={rec.id}
            style={{ background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 14, padding: 20, transition: 'border-color .15s,transform .15s' }}
            hoverStyle={{ borderColor: 'rgba(255,255,255,.18)', transform: 'translateY(-2px)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div style={{ font: '600 14.5px Sora,sans-serif' }}>{rec.type.replace(/_/g, ' ')}</div>
              {rec.riskBand && <div style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: RISK_BG[rec.riskBand], color: RISK_COLORS[rec.riskBand] }}>{rec.riskBand}</div>}
            </div>
            <div style={{ fontSize: 12.5, color: '#8b91a3', marginBottom: 12, lineHeight: 1.5 }}>{rec.rationale}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#7d8399', borderTop: '1px solid rgba(255,255,255,.06)', paddingTop: 10 }}>
              <div>Case: <span style={{ color: '#c4c8d4' }}>{rec.victimCode}</span></div>
              <div>Confidence: <span style={{ color: '#c4c8d4' }}>{rec.confidence}%</span></div>
            </div>
            {rec.interventionStatus && (
              <div style={{ marginTop: 8, fontSize: 11, color: 'oklch(0.68 0.14 200)' }}>Intervention: {rec.interventionStatus}</div>
            )}
          </Hoverable>
        ))}
      </div>
    </div>
  );
}
