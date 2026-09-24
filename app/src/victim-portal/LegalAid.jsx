import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { LEGAL_RESOURCES, LEGAL_FAQ } from '../data/constants';

const panel = { background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 14, padding: 16 };
const MILESTONE_COLOR = { completed: 'oklch(0.72 0.15 145)', in_progress: 'oklch(0.8 0.15 95)', upcoming: '#5c6178' };

export default function LegalAid() {
  const [kase, setKase] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openFaq, setOpenFaq] = useState(null);

  const reload = () => api.get('/api/cases/mine').then(setKase).catch(() => {}).finally(() => setLoading(false));

  useEffect(() => { reload(); }, []);

  // A new court hearing, compensation update, or case-status change should
  // reach this page live, same as CaseTimeline.jsx.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;
    socket.on('case:status_changed', reload);
    socket.on('case:timeline_update', reload);
    // Legal aid assignment/hearing/compensation updates broadcast
    // 'legal:update' specifically (see legalAid.routes.ts) - this is the
    // one that actually reaches this page for the events it most cares
    // about.
    socket.on('legal:update', reload);
    return () => {
      socket.off('case:status_changed', reload);
      socket.off('case:timeline_update', reload);
      socket.off('legal:update', reload);
    };
  }, []);

  const legal = kase?.legalAid?.[0];
  const courtCase = legal?.courtCase;

  return (
    <div className="tsa-fade" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ font: '700 20px Sora,sans-serif' }}>Legal Aid Center</div>

      {loading && <div style={{ color: '#7d8399', fontSize: 13 }}>Loading…</div>}

      {!loading && !legal && (
        <div style={panel}>No legal aid record yet. A legal officer will be assigned to your case if needed - this page will update automatically.</div>
      )}

      {legal && (
        <>
          <div style={panel}>
            <div style={{ fontSize: 11.5, color: '#7d8399', marginBottom: 6 }}>Your Legal Representative</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{legal.lawyerName}</div>
            <div style={{ fontSize: 12.5, color: '#8b91a3', marginBottom: 6 }}>{legal.specialization}</div>
            <div style={{ fontSize: 12.5, color: '#c4c8d4' }}>{legal.lawyerContact}</div>
          </div>

          {courtCase && (
            <div style={panel}>
              <div style={{ fontSize: 11.5, color: '#7d8399', marginBottom: 8 }}>Court Information</div>
              <div style={{ fontSize: 13, color: '#c4c8d4', marginBottom: 4 }}>Case No. {courtCase.caseNumber}</div>
              <div style={{ fontSize: 13, color: '#c4c8d4', marginBottom: 14 }}>{courtCase.court}</div>
              <div style={{ fontSize: 11.5, color: '#7d8399', marginBottom: 12 }}>Court Milestone Timeline</div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {courtCase.hearings.map((h) => (
                  <div key={h.id} style={{ display: 'flex', gap: 12, padding: '8px 0' }}>
                    <div style={{ width: 9, height: 9, borderRadius: '50%', background: MILESTONE_COLOR[h.status], marginTop: 4, flex: 'none' }} />
                    <div>
                      <div style={{ fontSize: 13, color: '#eef0f6' }}>{h.label}</div>
                      <div style={{ fontSize: 11.5, color: '#7d8399' }}>{new Date(h.scheduledAt).toLocaleDateString()} &middot; {h.status.replace(/_/g, ' ')}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {legal.compensation && (
            <div style={panel}>
              <div style={{ fontSize: 11.5, color: '#7d8399', marginBottom: 12 }}>Compensation Tracking</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {['applied', 'under_review', 'approved', 'released'].map((stage) => {
                  const stages = ['applied', 'under_review', 'approved', 'released'];
                  const reached = stages.indexOf(legal.compensation.stage) >= stages.indexOf(stage);
                  return (
                    <div key={stage} style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ height: 6, borderRadius: 3, background: reached ? 'oklch(0.72 0.15 145)' : 'rgba(255,255,255,.08)', marginBottom: 6 }} />
                      <div style={{ fontSize: 10.5, color: '#8b91a3', textTransform: 'capitalize' }}>{stage.replace('_', ' ')}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      <div style={panel}>
        <div style={{ fontSize: 11.5, color: '#7d8399', marginBottom: 10 }}>Legal Resources</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {LEGAL_RESOURCES.map((lr) => (
            <div key={lr.title} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,.06)' }}><div>{lr.title}</div><div style={{ color: '#5c6178' }}>{lr.type}</div></div>
          ))}
        </div>
      </div>
      <div style={panel}>
        <div style={{ fontSize: 11.5, color: '#7d8399', marginBottom: 10 }}>Ask the AI Legal Assistant</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {LEGAL_FAQ.map((lf, i) => (
            <div key={lf.q}>
              <div onClick={() => setOpenFaq(openFaq === i ? null : i)} style={{ padding: 12, borderRadius: 10, background: 'rgba(255,255,255,.05)', fontSize: 13.5, cursor: 'pointer' }}>{lf.q}</div>
              {openFaq === i && <div style={{ padding: 12, fontSize: 12.5, color: '#c4c8d4', lineHeight: 1.6 }}>{lf.a}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
