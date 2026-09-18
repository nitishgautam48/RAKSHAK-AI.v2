import { useEffect, useState } from 'react';
import Hoverable from '../components/Hoverable';
import { api } from '../lib/api';

const card = { background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 14, padding: 22 };
const BAND_META = {
  LOW: { color: 'oklch(0.72 0.15 145)', bg: 'oklch(0.72 0.15 145 / 0.08)', border: 'oklch(0.72 0.15 145 / 0.3)', action: 'Routine follow-up call within 7 days.' },
  MODERATE: { color: 'oklch(0.8 0.15 95)', bg: 'oklch(0.8 0.15 95 / 0.08)', border: 'oklch(0.8 0.15 95 / 0.3)', action: 'Counsellor assignment within 48 hours.' },
  HIGH: { color: 'oklch(0.7 0.17 55)', bg: 'oklch(0.7 0.17 55 / 0.08)', border: 'oklch(0.7 0.17 55 / 0.3)', action: 'District officer review and legal aid referral.' },
  CRITICAL: { color: 'oklch(0.62 0.21 25)', bg: 'oklch(0.62 0.21 25 / 0.08)', border: 'oklch(0.62 0.21 25 / 0.3)', action: 'Immediate police escalation and protection request.' },
};

export default function RiskIntelligence() {
  const [dist, setDist] = useState(null);
  const [overview, setOverview] = useState(null);
  const [trend, setTrend] = useState([]);
  const [districts, setDistricts] = useState([]);

  useEffect(() => {
    Promise.all([
      api.get('/api/analytics/risk-distribution'),
      api.get('/api/analytics/overview'),
      api.get('/api/analytics/svi-trend'),
      api.get('/api/analytics/district-risk'),
    ]).then(([d, ov, t, dr]) => {
      setDist(d);
      setOverview(ov);
      setTrend(t);
      setDistricts(dr.slice(0, 8));
    }).catch(() => {});
  }, []);

  const trendPoints = trend.length ? trend.map((w, i) => {
    const x = trend.length > 1 ? (i / (trend.length - 1)) * 600 : 300;
    const y = 160 - (w.avgSvi / 100) * 150 - 5;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ') : '';
  const overallAvg = overview?.averageSvi ?? 0;
  const historicalY = 160 - (overallAvg / 100) * 150 - 5;
  const historicalPoints = trend.length > 1 ? `0,${historicalY.toFixed(1)} 600,${historicalY.toFixed(1)}` : '';

  const escalationPct = overview?.averageEscalationProbability ?? 0;
  const dashLength = ((escalationPct / 100) * 314.16).toFixed(1) + ' 314.16';
  const districtMax = districts.length ? Math.max(...districts.map((d) => d.avgSvi), 1) : 1;
  const districtColor = (v) => (v >= 75 ? BAND_META.CRITICAL.color : v >= 55 ? BAND_META.HIGH.color : v >= 30 ? BAND_META.MODERATE.color : BAND_META.LOW.color);

  return (
    <div className="tsa-fade">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14, marginBottom: 18 }}>
        {dist && Object.entries(dist).map(([band, count]) => {
          const meta = BAND_META[band];
          return (
            <Hoverable
              key={band}
              style={{ background: meta.bg, border: `1px solid ${meta.border}`, borderRadius: 14, padding: 20, transition: 'transform .15s' }}
              hoverStyle={{ transform: 'translateY(-2px)' }}
            >
              <div style={{ font: '700 13px Sora,sans-serif', color: meta.color, marginBottom: 10 }}>{band} RISK</div>
              <div style={{ font: '700 30px Sora,sans-serif', marginBottom: 10 }}>{count}</div>
              <div style={{ fontSize: 12, color: '#8b91a3', lineHeight: 1.5 }}>{meta.action}</div>
            </Hoverable>
          );
        })}
      </div>
      <div style={card}>
        <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 16 }}>SVI Trend vs Overall Average</div>
        {trendPoints ? (
          <svg viewBox="0 0 600 160" style={{ width: '100%', height: 160 }}>
            <polyline points={trendPoints} fill="none" stroke="oklch(0.7 0.17 55)" strokeWidth="2.5"><title>Weekly average SVI</title></polyline>
            {historicalPoints && <polyline points={historicalPoints} fill="none" stroke="#5c6178" strokeWidth="2" strokeDasharray="4,4"><title>Overall average for comparison</title></polyline>}
          </svg>
        ) : (
          <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5c6178', fontSize: 12.5 }}>No scored assessments yet.</div>
        )}
        <div style={{ display: 'flex', gap: 20, marginTop: 10, fontSize: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 10, height: 2, background: 'oklch(0.7 0.17 55)' }} />Weekly average</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 10, height: 2, background: '#5c6178' }} />Overall average</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16, marginTop: 16 }}>
        <div className="tsa-card-hover" style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 14, alignSelf: 'flex-start' }}>Escalation Probability</div>
          <svg viewBox="0 0 120 120" style={{ width: 130, height: 130 }}>
            <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="10" />
            <circle cx="60" cy="60" r="50" fill="none" stroke="oklch(0.7 0.17 55)" strokeWidth="10" strokeLinecap="round" strokeDasharray={dashLength} transform="rotate(-90 60 60)" />
            <text x="60" y="66" textAnchor="middle" fill="#eef0f6" fontSize="24" fontWeight="700" fontFamily="Sora,sans-serif">{escalationPct}%</text>
          </svg>
          <div style={{ fontSize: 11.5, color: '#8b91a3', marginTop: 6 }}>Average across all scored assessments</div>
        </div>
        <div className="tsa-card-hover" style={card}>
          <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 14 }}>District Comparison (avg SVI)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {districts.length === 0 && <div style={{ color: '#5c6178', fontSize: 12.5 }}>No scored assessments yet.</div>}
            {districts.map((d) => (
              <div key={`${d.state}-${d.district}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <div style={{ color: '#c4c8d4' }}>{d.district}, {d.state}</div><div style={{ color: districtColor(d.avgSvi), fontWeight: 600 }}>{d.avgSvi}</div>
                </div>
                <div style={{ height: 6, borderRadius: 4, background: 'rgba(255,255,255,.06)' }}>
                  <div style={{ height: '100%', borderRadius: 4, background: districtColor(d.avgSvi), width: `${(100 * d.avgSvi) / districtMax}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
