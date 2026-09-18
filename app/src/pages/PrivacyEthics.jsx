import { useEffect, useState } from 'react';
import { api } from '../lib/api';

const card = { background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 14, padding: 22 };
const SCOPE_LABEL = { ai_assessment: 'AI Assessment Processing', data_sharing: 'Cross-agency Data Sharing' };

export default function PrivacyEthics() {
  const [consent, setConsent] = useState(null);
  const [retention, setRetention] = useState(null);
  const [auditLog, setAuditLog] = useState(null);
  const [auditForbidden, setAuditForbidden] = useState(false);
  const [auditSummary, setAuditSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/api/consent/stats'),
      api.get('/api/meta/retention-policy'),
      api.get('/api/meta/audit-summary'),
      api.get('/api/admin/audit-log?pageSize=15').catch((e) => { if (e.status === 403) setAuditForbidden(true); return null; }),
    ])
      .then(([c, r, s, a]) => { setConsent(c); setRetention(r); setAuditSummary(s); setAuditLog(a); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="tsa-fade">
      {loading && <div style={{ color: '#7d8399', fontSize: 13, marginBottom: 16 }}>Loading…</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div style={card}>
          <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 14 }}>Consent Management</div>
          {consent && (
            <>
              <div style={{ fontSize: 12, color: '#8b91a3', marginBottom: 14 }}>{consent.totalVictims} registered victim records</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {consent.byScope.map((s) => (
                  <div key={s.scope} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,.03)' }}>
                    <div>
                      <div style={{ fontSize: 13 }}>{SCOPE_LABEL[s.scope] ?? s.scope}</div>
                      <div style={{ fontSize: 11, color: '#5c6178' }}>{s.count} of {consent.totalVictims} have granted consent</div>
                    </div>
                    <div style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, color: 'oklch(0.72 0.15 145)', background: 'oklch(0.72 0.15 145 / 0.12)' }}>
                      {Math.round((100 * s.count) / consent.totalVictims)}%
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 10, background: 'oklch(0.7 0.17 55 / 0.1)', border: '1px solid oklch(0.7 0.17 55 / 0.3)', fontSize: 12, color: 'oklch(0.78 0.15 55)' }}>
            Consent is recorded per victim, per processing scope, and is enforced at the API layer — requests without an active grant are rejected before any AI processing occurs.
          </div>
        </div>

        <div style={card}>
          <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 14 }}>Data Retention Policy</div>
          {retention && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,.03)' }}>
                <div style={{ fontSize: 13 }}>Audit Logs</div>
                <div style={{ fontSize: 13, color: '#8b91a3' }}>{retention.auditLogs} days</div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,.03)' }}>
                <div style={{ fontSize: 13 }}>Voice Transcripts</div>
                <div style={{ fontSize: 13, color: '#8b91a3' }}>{retention.voiceTranscripts} days</div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,.03)' }}>
                <div style={{ fontSize: 13 }}>Closed Complaints</div>
                <div style={{ fontSize: 13, color: '#8b91a3' }}>{retention.closedComplaints} days</div>
              </div>
            </div>
          )}
          <div style={{ marginTop: 14, fontSize: 11.5, color: '#5c6178' }}>
            Records past their retention window are purged by an automated sweep, logged as a RetentionSweep audit entry.
          </div>
        </div>
      </div>

      <div style={card}>
        <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 4 }}>Audit History &amp; Data Access Log</div>
        {auditSummary && (
          <div style={{ display: 'flex', gap: 20, marginBottom: 14, marginTop: 10 }}>
            <div><div style={{ font: '700 20px Sora,sans-serif' }}>{auditSummary.total}</div><div style={{ fontSize: 11, color: '#8b91a3' }}>Total logged actions</div></div>
            {auditSummary.byAction.map((a) => (
              <div key={a.action}><div style={{ font: '700 16px Sora,sans-serif', color: '#8b91a3' }}>{a.count}</div><div style={{ fontSize: 11, color: '#8b91a3' }}>{a.action}</div></div>
            ))}
          </div>
        )}
        {auditForbidden && (
          <div style={{ fontSize: 12, color: '#5c6178', marginTop: 4 }}>Raw entries require Administrator, State Administrator, or Ministry Official access — showing aggregate counts only.</div>
        )}
        {auditLog?.items && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 14 }}>
            {auditLog.items.map((entry) => (
              <div key={entry.id} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
                <div style={{ width: 150, color: '#5c6178', fontSize: 11, fontFamily: "'IBM Plex Mono',monospace" }}>{new Date(entry.createdAt).toLocaleString()}</div>
                <div>
                  <div style={{ fontSize: 12.5, color: '#eef0f6' }}>{entry.action} &middot; {entry.entityType}</div>
                  <div style={{ fontSize: 11, color: '#7d8399' }}>{entry.user?.fullName ?? 'System'}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
