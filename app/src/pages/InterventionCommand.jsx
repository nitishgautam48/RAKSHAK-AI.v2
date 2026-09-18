import { useEffect, useState } from 'react';
import { COMMAND_STEPS } from '../data/constants';
import { api } from '../lib/api';

const card = { background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 14, padding: 22 };
const STATUS_COLOR = { pending: 'oklch(0.8 0.15 95)', active: 'oklch(0.62 0.21 25)', completed: 'oklch(0.72 0.15 145)', declined: '#5c6178' };

export default function InterventionCommand() {
  const [interventions, setInterventions] = useState([]);
  const [sosOpen, setSosOpen] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get('/api/interventions'), api.get('/api/sos')])
      .then(([iv, sos]) => { setInterventions(iv); setSosOpen(sos.filter((s) => s.status !== 'RESOLVED').length); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const counts = {
    pending: interventions.filter((i) => i.status === 'pending').length,
    active: interventions.filter((i) => i.status === 'active').length,
    completed: interventions.filter((i) => i.status === 'completed').length,
  };
  const kpis = [
    { label: 'Open SOS Alerts', value: sosOpen, color: 'oklch(0.62 0.21 25)' },
    { label: 'Pending Interventions', value: counts.pending, color: 'oklch(0.8 0.15 95)' },
    { label: 'Active Interventions', value: counts.active, color: 'oklch(0.62 0.21 25)' },
    { label: 'Completed Interventions', value: counts.completed, color: 'oklch(0.72 0.15 145)' },
  ];

  return (
    <div className="tsa-fade">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 14, marginBottom: 18 }}>
        {kpis.map((ck) => (
          <div key={ck.label} style={{ background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 11.5, color: '#8b91a3', marginBottom: 8 }}>{ck.label}</div>
            <div style={{ font: '700 26px Sora,sans-serif', color: ck.color }}>{ck.value}</div>
          </div>
        ))}
      </div>
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 4 }}>Escalation Workflow</div>
        <div style={{ fontSize: 11, color: '#5c6178', marginBottom: 12 }}>Standard process for every registered complaint</div>
        <div className="tsa-scroll" style={{ display: 'flex', overflowX: 'auto' }}>
          {COMMAND_STEPS.map((cst) => (
            <div key={cst.n} style={{ display: 'flex', alignItems: 'center', flex: 'none' }}>
              <div style={{ width: 140, textAlign: 'center' }}>
                <div style={{ width: 48, height: 48, borderRadius: 10, background: 'linear-gradient(135deg,oklch(0.3 0.06 25),oklch(0.24 0.04 55))', border: '1px solid rgba(255,255,255,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px', font: '700 14px Sora,sans-serif', color: 'oklch(0.75 0.15 55)' }}>{cst.n}</div>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{cst.label}</div>
              </div>
              {cst.hasArrow && <div style={{ width: 28, height: 1, background: 'rgba(255,255,255,.15)', flex: 'none' }} />}
            </div>
          ))}
        </div>
      </div>
      <div style={card}>
        <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 14 }}>Interventions</div>
        {loading && <div style={{ color: '#7d8399', fontSize: 13 }}>Loading…</div>}
        {!loading && interventions.length === 0 && <div style={{ color: '#5c6178', fontSize: 12.5 }}>No interventions tracked yet. They are created from AI Recommendations once an officer acts on one.</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {interventions.map((iv) => (
            <div key={iv.id} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLOR[iv.status] ?? '#5c6178', marginTop: 5, flex: 'none' }} />
              <div>
                <div style={{ fontSize: 12.5 }}>{iv.type.replace(/_/g, ' ')} &middot; {iv.case?.victim?.displayCode ?? iv.case?.complaint?.code ?? 'Unknown case'}</div>
                <div style={{ fontSize: 11, color: '#5c6178' }}>{iv.status} &middot; {new Date(iv.createdAt).toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
