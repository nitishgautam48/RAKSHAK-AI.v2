import { useEffect, useState } from 'react';
import { api } from '../lib/api';

const card = { background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 14, padding: 22 };

function BarChart({ title, subtitle, color, bars }) {
  const max = bars.length ? Math.max(...bars.map((b) => b.value), 1) : 1;
  return (
    <div style={card}>
      <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 2 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 11, color: '#5c6178', marginBottom: 14 }}>{subtitle}</div>}
      {bars.length === 0 && <div style={{ color: '#5c6178', fontSize: 12.5 }}>No data yet.</div>}
      {bars.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 110 }}>
          {bars.map((b) => (
            <div key={b.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, justifyContent: 'flex-end', height: '100%' }}>
              <div style={{ fontSize: 10, color: '#8b91a3' }}>{b.value}</div>
              <div style={{ width: '100%', borderRadius: '4px 4px 0 0', background: color, height: `${Math.max(4, (100 * b.value) / max)}%` }} />
              <div style={{ fontSize: 10, color: '#7d8399', textAlign: 'center' }}>{b.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ReportsAnalytics() {
  const [monthly, setMonthly] = useState([]);
  const [stateRankings, setStateRankings] = useState([]);
  const [districtRisk, setDistrictRisk] = useState([]);
  const [recos, setRecos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/api/analytics/monthly-trend'),
      api.get('/api/analytics/state-rankings'),
      api.get('/api/analytics/district-risk'),
      api.get('/api/analytics/recommendations-overview'),
    ])
      .then(([m, s, d, r]) => { setMonthly(m); setStateRankings(s); setDistrictRisk(d); setRecos(r); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="tsa-fade">
      {loading && <div style={{ color: '#7d8399', fontSize: 13, marginBottom: 16 }}>Loading…</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <BarChart
          title="Monthly Complaint Volume"
          subtitle="Complaints registered per calendar month"
          color="oklch(0.6 0.15 235)"
          bars={monthly.map((m) => ({ label: m.month, value: m.count }))}
        />
        <BarChart
          title="State Comparison (Active Cases)"
          subtitle="Top 6 states by currently active case count"
          color="oklch(0.65 0.14 200)"
          bars={stateRankings.slice(0, 6).map((s) => ({ label: s.state, value: s.activeCases }))}
        />
        <BarChart
          title="District Risk (Average SVI)"
          subtitle="Top 6 districts by average survivor vulnerability index"
          color="oklch(0.7 0.17 55)"
          bars={districtRisk.slice(0, 6).map((d) => ({ label: d.district, value: d.avgSvi }))}
        />
        <BarChart
          title="Recommendation Type Breakdown"
          subtitle="AI-generated recommendations by intervention type"
          color="oklch(0.72 0.15 145)"
          bars={recos.map((r) => ({ label: r.label, value: r.count }))}
        />
      </div>
    </div>
  );
}
