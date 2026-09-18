import { useEffect, useState } from 'react';
import { api } from '../lib/api';

const card = { background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 14, padding: 22 };
const row = { display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,.05)' };

function Panel({ title, children }) {
  return (
    <div style={card}>
      <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 12 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </div>
  );
}
function Row({ label, value }) {
  return <div style={row}><div style={{ color: '#c4c8d4' }}>{label}</div><div style={{ color: '#8b91a3' }}>{value}</div></div>;
}

export default function Settings() {
  const [users, setUsers] = useState(null);
  const [usersForbidden, setUsersForbidden] = useState(false);
  const [registry, setRegistry] = useState(null);
  const [retention, setRetention] = useState(null);
  const [systemSettings, setSystemSettings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/api/admin/users').catch((e) => { if (e.status === 403) setUsersForbidden(true); return null; }),
      api.get('/api/ai-monitoring/registry'),
      api.get('/api/meta/retention-policy'),
      api.get('/api/system-settings'),
    ])
      .then(([u, r, ret, ss]) => { setUsers(u); setRegistry(r); setRetention(ret); setSystemSettings(ss); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const roleCounts = users ? Object.entries(
    users.reduce((acc, u) => { const r = u.role.name; acc[r] = (acc[r] ?? 0) + 1; return acc; }, {}),
  ).sort((a, b) => b[1] - a[1]) : [];
  const activeModels = (registry?.models ?? []).filter((m) => m.status === 'active');

  return (
    <div className="tsa-fade">
      {loading && <div style={{ color: '#7d8399', fontSize: 13, marginBottom: 16 }}>Loading…</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Panel title="User Management">
          {usersForbidden && <div style={{ color: '#5c6178', fontSize: 12.5 }}>Requires Administrator, State Administrator, or Ministry Official access.</div>}
          {users && (
            <>
              <Row label="Total Government Users" value={users.length} />
              {roleCounts.map(([r, c]) => <Row key={r} label={r.replace(/_/g, ' ')} value={c} />)}
            </>
          )}
        </Panel>

        <Panel title="Access &amp; Permissions">
          <Row label="Access Model" value="Role-based (RBAC)" />
          <Row label="Roles Configured" value="12" />
          <Row label="PII Field-level Encryption" value="AES-256-GCM" />
          <Row label="Multi-factor Authentication" value="Not implemented in this build" />
          <Row label="Consent Enforcement" value="Enforced at API layer (HTTP 428 if missing)" />
        </Panel>

        <Panel title="Language Coverage">
          <Row label="NLP Trauma Lexicon" value="English + Hindi" />
          <Row label="Automatic Translation" value="Not implemented in this build" />
          <Row label="Automatic Language Detection" value="Not implemented in this build" />
        </Panel>

        <Panel title="AI Model Versions">
          {activeModels.length === 0 && <div style={{ color: '#5c6178', fontSize: 12.5 }}>No active models registered.</div>}
          {activeModels.map((m) => <Row key={m.engine} label={m.engine.toUpperCase()} value={m.version} />)}
        </Panel>

        <Panel title="Data Retention">
          {retention && (
            <>
              <Row label="Audit Logs" value={`${retention.auditLogs} days`} />
              <Row label="Voice Transcripts" value={`${retention.voiceTranscripts} days`} />
              <Row label="Closed Complaints" value={`${retention.closedComplaints} days`} />
            </>
          )}
        </Panel>

        <Panel title="Session &amp; Security">
          <Row label="Authentication" value="JWT bearer token" />
          <Row label="Session Token Lifetime" value="8 hours" />
          <Row label="Transport Security" value="HTTPS / TLS" />
          {systemSettings.length === 0 && <div style={{ color: '#5c6178', fontSize: 11.5, marginTop: 6 }}>No custom system settings have been configured yet.</div>}
          {systemSettings.map((s) => <Row key={s.key} label={s.key} value={s.value} />)}
        </Panel>
      </div>
    </div>
  );
}
