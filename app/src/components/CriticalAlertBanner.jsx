import { useEffect, useState } from 'react';
import { getSocket } from '../lib/socket';

// Phase 3: a CRITICAL-band assessment must be an immediately-visible alert
// to whoever is on shift, not a silent list refresh someone might not
// notice for hours. The server broadcasts 'alert:critical' to every
// connected government socket (see assessments.routes.ts) specifically
// because a brand-new complaint's case usually has nobody assigned yet -
// this banner is what makes that broadcast actually visible, regardless of
// which page a staff member currently has open.
const AUTO_DISMISS_MS = 30000;

export default function CriticalAlertBanner({ onViewCase }) {
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;
    const onCritical = (payload) => {
      const id = payload.assessmentId ?? `${Date.now()}-${Math.random()}`;
      setAlerts((prev) => [...prev, { ...payload, id }]);
      setTimeout(() => setAlerts((prev) => prev.filter((a) => a.id !== id)), AUTO_DISMISS_MS);
    };
    socket.on('alert:critical', onCritical);
    return () => socket.off('alert:critical', onCritical);
  }, []);

  const dismiss = (id) => setAlerts((prev) => prev.filter((a) => a.id !== id));

  if (alerts.length === 0) return null;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 2 }}>
      {alerts.map((a) => (
        <div
          key={a.id}
          style={{
            display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px',
            background: 'oklch(0.55 0.22 25)', color: '#fff', boxShadow: '0 2px 12px rgba(0,0,0,.35)',
          }}
        >
          <div style={{ font: '800 11px Sora,sans-serif', letterSpacing: '.06em', padding: '4px 9px', borderRadius: 20, background: 'rgba(255,255,255,.2)', flex: 'none' }}>CRITICAL</div>
          <div style={{ fontSize: 13, flex: 1 }}>
            New CRITICAL risk assessment{a.complaintCode ? ` on ${a.complaintCode}` : ''}{a.victimCode ? ` (${a.victimCode})` : ''} - SVI {a.sviValue}. Immediate review required.
          </div>
          {onViewCase && (
            <button
              onClick={() => { onViewCase(a); dismiss(a.id); }}
              style={{ font: '700 12px Sora,sans-serif', padding: '7px 14px', borderRadius: 8, border: 'none', background: '#fff', color: 'oklch(0.5 0.2 25)', cursor: 'pointer', flex: 'none' }}
            >
              View Case
            </button>
          )}
          <button
            onClick={() => dismiss(a.id)}
            aria-label="Dismiss"
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.8)', fontSize: 18, cursor: 'pointer', flex: 'none', lineHeight: 1 }}
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}
