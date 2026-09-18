import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { useAuth } from '../lib/AuthContext';

const panel = { background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 14, padding: 16 };
const RISK_LABEL = { LOW: 'Low support needs', MODERATE: 'Being closely monitored', HIGH: 'High priority support', CRITICAL: 'Critical - active protection' };

export default function VictimDashboard() {
  const { user } = useAuth();
  const [kase, setKase] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/api/cases/mine')
      .then(setKase)
      .catch((err) => setError(err.status === 404 ? 'no_case' : 'error'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const refresh = () => api.get('/api/cases/mine').then(setKase).catch(() => {});
    socket.on('case:status_changed', refresh);
    socket.on('case:timeline_update', refresh);
    socket.on('assessment:new', refresh);
    socket.on('legal:update', refresh);
    return () => {
      socket.off('case:status_changed', refresh);
      socket.off('case:timeline_update', refresh);
      socket.off('assessment:new', refresh);
      socket.off('legal:update', refresh);
    };
  }, []);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#7d8399' }}>Loading your case…</div>;
  if (error === 'no_case') {
    return (
      <div className="tsa-fade" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ font: '700 22px Sora,sans-serif' }}>Hello, {user?.fullName}</div>
        <div style={panel}>No case is linked to your account yet. Once a complaint is filed on your behalf, it will appear here automatically.</div>
      </div>
    );
  }
  if (error || !kase) return <div style={{ padding: 40, textAlign: 'center', color: '#7d8399' }}>Could not load your case right now.</div>;

  const officer = kase.assignments.find((a) => a.role === 'DISTRICT_OFFICER' || a.role === 'INVESTIGATING_OFFICER')?.user;
  const legal = kase.legalAid?.[0];

  return (
    <div className="tsa-fade" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ font: '700 22px Sora,sans-serif', marginBottom: 4 }}>Hello, {kase.victim.name}</div>
        <div style={{ fontSize: 14, color: '#8b91a3' }}>{RISK_LABEL[kase.riskLevel]}</div>
      </div>
      <div style={{ ...panel, borderRadius: 16, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 13, color: '#8b91a3' }}>Case Number</div><div style={{ fontSize: 13, fontFamily: "'IBM Plex Mono',monospace" }}>{kase.caseNumber}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 13, color: '#8b91a3' }}>Status</div><div style={{ fontSize: 13, fontWeight: 600, color: 'oklch(0.8 0.15 95)' }}>{kase.status.replace(/_/g, ' ')}</div>
        </div>
        <div style={{ fontSize: 12, color: '#7d8399' }}>Opened {new Date(kase.openedAt).toLocaleDateString()}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={panel}>
          <div style={{ fontSize: 11.5, color: '#7d8399', marginBottom: 6 }}>Your Officer</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{officer?.fullName || 'Not yet assigned'}</div>
          <div style={{ fontSize: 11.5, color: '#8b91a3' }}>{officer?.department || ''}</div>
        </div>
        <div style={panel}>
          <div style={{ fontSize: 11.5, color: '#7d8399', marginBottom: 6 }}>Legal Representative</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{legal?.lawyerName || 'Not yet assigned'}</div>
          <div style={{ fontSize: 11.5, color: '#8b91a3' }}>{legal?.specialization || ''}</div>
        </div>
      </div>
      <div style={{ background: 'oklch(0.72 0.15 145 / 0.1)', border: '1px solid oklch(0.72 0.15 145 / 0.3)', borderRadius: 14, padding: 16 }}>
        <div style={{ fontSize: 11.5, color: 'oklch(0.78 0.13 145)', marginBottom: 4 }}>Safety Status</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#eef0f6' }}>
          {kase.riskLevel === 'CRITICAL' || kase.riskLevel === 'HIGH' ? 'Your case has an active protection review' : 'Your case is being monitored by your assigned officer'}
        </div>
      </div>
      <div style={panel}>
        <div style={{ fontSize: 11.5, color: '#7d8399', marginBottom: 10 }}>Recent Updates</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {kase.timeline.length === 0 && <div style={{ fontSize: 12.5, color: '#5c6178' }}>No updates yet.</div>}
          {kase.timeline.slice(0, 6).map((t) => (
            <div key={t.id} style={{ fontSize: 12.5 }}>
              <div style={{ color: '#eef0f6' }}>{t.summary}</div>
              <div style={{ color: '#5c6178', fontSize: 11 }}>{new Date(t.createdAt).toLocaleString()}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
