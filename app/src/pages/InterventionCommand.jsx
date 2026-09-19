import { useEffect, useState } from 'react';
import { COMMAND_STEPS } from '../data/constants';
import { api } from '../lib/api';

const card = { background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 14, padding: 22 };
const STATUS_COLOR = { pending: 'oklch(0.8 0.15 95)', active: 'oklch(0.62 0.21 25)', completed: 'oklch(0.72 0.15 145)', declined: '#5c6178' };
const RISK_COLORS = { LOW: 'oklch(0.72 0.15 145)', MODERATE: 'oklch(0.8 0.15 95)', HIGH: 'oklch(0.7 0.17 55)', CRITICAL: 'oklch(0.62 0.21 25)' };
const ASSIGNMENT_ROLES = ['DISTRICT_OFFICER', 'INVESTIGATING_OFFICER', 'COUNSELLOR', 'LEGAL_OFFICER', 'SOCIAL_JUSTICE_OFFICER'];
// Maps an assignment role to the RoleName used to look up candidate staff -
// mostly identical, except INVESTIGATING_OFFICER maps to the real user role
// POLICE_OFFICER (see workload.service.ts / staff.routes.ts).
const ASSIGNMENT_ROLE_TO_STAFF_ROLE = { INVESTIGATING_OFFICER: 'POLICE_OFFICER', DISTRICT_OFFICER: 'DISTRICT_OFFICER', COUNSELLOR: 'COUNSELLOR', LEGAL_OFFICER: 'LEGAL_OFFICER', SOCIAL_JUSTICE_OFFICER: 'SOCIAL_JUSTICE_OFFICER' };

export default function InterventionCommand() {
  const [interventions, setInterventions] = useState([]);
  const [sosOpen, setSosOpen] = useState(0);
  const [loading, setLoading] = useState(true);
  const [queue, setQueue] = useState([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [assigningCaseId, setAssigningCaseId] = useState(null);
  const [assignRole, setAssignRole] = useState('DISTRICT_OFFICER');
  const [candidates, setCandidates] = useState([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [assignBusy, setAssignBusy] = useState(false);

  const reloadQueue = () => api.get('/api/cases/priority-queue?limit=15').then(setQueue).catch(() => {});

  useEffect(() => {
    Promise.all([api.get('/api/interventions'), api.get('/api/sos')])
      .then(([iv, sos]) => { setInterventions(iv); setSosOpen(sos.filter((s) => s.status !== 'RESOLVED').length); })
      .catch(() => {})
      .finally(() => setLoading(false));
    reloadQueue().finally(() => setQueueLoading(false));
  }, []);

  const openAssignPicker = (caseId) => {
    setAssigningCaseId(caseId);
    setAssignRole('DISTRICT_OFFICER');
  };

  useEffect(() => {
    if (!assigningCaseId) return;
    setCandidatesLoading(true);
    const staffRole = ASSIGNMENT_ROLE_TO_STAFF_ROLE[assignRole];
    api.get(`/api/staff?role=${staffRole}&sort=workload`)
      .then(setCandidates)
      .catch(() => setCandidates([]))
      .finally(() => setCandidatesLoading(false));
  }, [assigningCaseId, assignRole]);

  const assignOfficer = async (userId) => {
    if (!assigningCaseId || assignBusy) return;
    setAssignBusy(true);
    try {
      await api.post(`/api/cases/${assigningCaseId}/assign`, { userId, role: assignRole });
      setAssigningCaseId(null);
      await reloadQueue();
    } catch {
      // eslint-disable-next-line no-alert
      alert('Could not assign this officer.');
    } finally {
      setAssignBusy(false);
    }
  };

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
        <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 2 }}>Priority Queue &middot; What to look at first</div>
        <div style={{ fontSize: 11, color: '#5c6178', marginBottom: 14 }}>
          Ranked by SVI value plus a disclosed, capped bonus for time spent unactioned (+0.5 pt/hour, capped at +20) - so a case
          nobody has touched surfaces over time instead of sitting buried behind newer, higher-severity ones indefinitely.
          Excludes closed cases.
        </div>
        {queueLoading && <div style={{ color: '#7d8399', fontSize: 13 }}>Loading…</div>}
        {!queueLoading && queue.length === 0 && <div style={{ color: '#5c6178', fontSize: 12.5 }}>No open cases to prioritize.</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {queue.map((q) => (
            <div key={q.caseId} style={{ borderBottom: '1px solid rgba(255,255,255,.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 0' }}>
                <div style={{ width: 24, textAlign: 'center', font: '700 13px Sora,sans-serif', color: '#5c6178' }}>#{q.rank}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{q.caseNumber}</span>
                    <span style={{ color: '#5c6178' }}>&middot;</span>
                    <span>{q.victim.displayCode}</span>
                    <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600, background: RISK_COLORS[q.riskLevel].replace(')', ' / 0.15)'), color: RISK_COLORS[q.riskLevel] }}>{q.riskLevel}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#5c6178', marginTop: 2 }}>
                    {q.incidentType} &middot; {q.victim.district}, {q.victim.state} &middot; waiting {q.priority.hoursWaiting}h &middot; {q.assignedTo.length ? q.assignedTo.map((a) => a.name).join(', ') : 'Unassigned'}
                  </div>
                </div>
                <div title={`SVI ${q.priority.sviValue} + aging bonus ${q.priority.agingBonus} (waited ${q.priority.hoursWaiting}h)`} style={{ textAlign: 'right', flex: 'none' }}>
                  <div style={{ font: '700 16px Sora,sans-serif' }}>{q.priority.priorityScore}</div>
                  <div style={{ fontSize: 9.5, color: '#5c6178' }}>{q.priority.sviValue} SVI +{q.priority.agingBonus}</div>
                </div>
                <button
                  onClick={() => (assigningCaseId === q.caseId ? setAssigningCaseId(null) : openAssignPicker(q.caseId))}
                  style={{ flex: 'none', padding: '6px 12px', borderRadius: 8, border: '1px solid oklch(0.65 0.14 200 / 0.4)', background: assigningCaseId === q.caseId ? 'oklch(0.65 0.14 200 / 0.2)' : 'oklch(0.65 0.14 200 / 0.1)', color: 'oklch(0.75 0.13 200)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}
                >
                  {q.assignedTo.length ? 'Reassign' : 'Assign'}
                </button>
              </div>

              {assigningCaseId === q.caseId && (
                <div style={{ padding: '0 0 14px 38px' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontSize: 11, color: '#8b91a3' }}>Role:</div>
                    <select value={assignRole} onChange={(e) => setAssignRole(e.target.value)} style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', color: '#eef0f6', fontSize: 11.5, padding: '5px 8px', borderRadius: 6 }}>
                      {ASSIGNMENT_ROLES.map((r) => <option key={r} value={r} style={{ background: '#171a24' }}>{r.replace(/_/g, ' ')}</option>)}
                    </select>
                    <div style={{ fontSize: 10.5, color: '#5c6178' }}>Ranked by current open caseload, least-loaded first</div>
                  </div>
                  {candidatesLoading && <div style={{ fontSize: 11.5, color: '#7d8399' }}>Loading candidates…</div>}
                  {!candidatesLoading && candidates.length === 0 && <div style={{ fontSize: 11.5, color: '#5c6178' }}>No staff found with this role.</div>}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {candidates.map((c, i) => (
                      <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 8, background: i === 0 ? 'oklch(0.72 0.15 145 / 0.08)' : 'rgba(255,255,255,.03)', border: i === 0 ? '1px solid oklch(0.72 0.15 145 / 0.3)' : '1px solid transparent' }}>
                        <div style={{ flex: 1, fontSize: 12 }}>
                          {c.fullName} {i === 0 && <span style={{ color: 'oklch(0.72 0.15 145)', fontSize: 10, fontWeight: 600 }}>· LEAST LOADED</span>}
                          <div style={{ fontSize: 10.5, color: '#5c6178' }}>{c.district ?? c.state ?? c.department ?? ''} &middot; {c.openCaseCount} open case{c.openCaseCount === 1 ? '' : 's'}</div>
                        </div>
                        <button onClick={() => assignOfficer(c.id)} disabled={assignBusy} style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: 'oklch(0.65 0.14 200)', color: '#0d0f16', fontSize: 11, fontWeight: 700, cursor: 'pointer', opacity: assignBusy ? 0.6 : 1 }}>
                          Assign
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
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
