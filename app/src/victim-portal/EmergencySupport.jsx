import { useEffect, useState } from 'react';
import { NEARBY_SERVICES, EMERGENCY_CONTACTS } from '../data/constants';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthContext';

export default function EmergencySupport() {
  const { user } = useAuth();
  const [location, setLocation] = useState(null);
  const [sosStatus, setSosStatus] = useState('idle'); // idle | sending | sent | error

  useEffect(() => {
    if (!user?.victimId) return;
    api.get('/api/cases/mine').then((k) => setLocation({ state: k.victim.state, district: k.victim.district })).catch(() => {});
  }, [user]);

  const triggerSos = async () => {
    setSosStatus('sending');
    try {
      await api.post('/api/sos', {
        victimId: user?.victimId,
        state: location?.state,
        district: location?.district,
        notes: 'SOS triggered from Survivor Portal.',
      });
      setSosStatus('sent');
    } catch {
      setSosStatus('error');
    }
  };

  return (
    <div className="tsa-fade" style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', textAlign: 'center', paddingTop: 10 }}>
      <div style={{ font: '700 20px Sora,sans-serif' }}>You are not alone. Help is one tap away.</div>
      <div
        onClick={sosStatus === 'idle' || sosStatus === 'error' ? triggerSos : undefined}
        style={{ width: 150, height: 150, borderRadius: '50%', background: 'oklch(0.62 0.21 25)', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '800 18px Sora,sans-serif', color: '#fff', cursor: 'pointer', boxShadow: '0 0 0 12px oklch(0.62 0.21 25 / 0.15)' }}
      >
        {sosStatus === 'sending' ? 'Sending…' : sosStatus === 'sent' ? 'Sent ✓' : 'SOS'}
      </div>
      {sosStatus === 'sent' && <div style={{ fontSize: 12.5, color: 'oklch(0.72 0.15 145)' }}>Nearby officers and the district administration have been notified in real time.</div>}
      {sosStatus === 'error' && <div style={{ fontSize: 12.5, color: 'oklch(0.7 0.17 55)' }}>Could not reach the server. Please call the helpline directly.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', marginTop: 10 }}>
        <a href="tel:14566" style={{ padding: 16, borderRadius: 12, border: 'none', background: 'oklch(0.62 0.21 25)', color: '#fff', font: '700 15px Sora,sans-serif', cursor: 'pointer', textDecoration: 'none', textAlign: 'center' }}>Call Helpline 14566</a>
        <button onClick={triggerSos} style={{ padding: 16, borderRadius: 12, border: '1px solid rgba(255,255,255,.15)', background: 'rgba(255,255,255,.05)', color: '#eef0f6', font: "600 14px 'IBM Plex Sans',sans-serif", cursor: 'pointer' }}>Request Immediate Protection</button>
      </div>
      <div style={{ width: '100%', marginTop: 24, textAlign: 'left' }}>
        <div style={{ font: '700 15px Sora,sans-serif', marginBottom: 12 }}>Support Services Near You</div>
        <div style={{ width: '100%', height: 110, borderRadius: 12, border: '1px dashed rgba(255,255,255,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#5c6178', fontFamily: "'IBM Plex Mono',monospace", marginBottom: 14 }}>
          map placeholder — nearby services
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {NEARBY_SERVICES.map((ns) => (
            <div key={ns.type} style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 11, color: '#7d8399', marginBottom: 4 }}>{ns.type}</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{ns.name}</div>
              <div style={{ fontSize: 12, color: '#8b91a3' }}>{ns.meta} &middot; {ns.contact}</div>
            </div>
          ))}
        </div>
        <div style={{ font: '700 15px Sora,sans-serif', margin: '20px 0 12px' }}>Emergency Contacts</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {EMERGENCY_CONTACTS.map((ec) => (
            <div key={ec.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,.06)' }}><div style={{ color: '#8b91a3' }}>{ec.label}</div><div>{ec.value}</div></div>
          ))}
        </div>
      </div>
    </div>
  );
}
