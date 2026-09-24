import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';

const card = { background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 14, padding: 22 };
const RISK_COLORS = { LOW: 'oklch(0.72 0.15 145)', MODERATE: 'oklch(0.8 0.15 95)', HIGH: 'oklch(0.7 0.17 55)', CRITICAL: 'oklch(0.62 0.21 25)' };

function InsightCard({ title, color, items }) {
  return (
    <div style={{ background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 14, padding: 20 }}>
      <div style={{ font: '600 13px Sora,sans-serif', marginBottom: 10, color }}>{title}</div>
      {items.length === 0 && <div style={{ fontSize: 12, color: '#5c6178' }}>Not enough data yet.</div>}
      {items.map((it) => (
        <div key={it} style={{ fontSize: 12, color: '#c4c8d4', lineHeight: 1.6, marginBottom: 6 }}>&middot; {it}</div>
      ))}
    </div>
  );
}

function toPoints(values, w, h) {
  if (values.length < 2) return '';
  const max = Math.max(...values, 1);
  return values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - (v / max) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

// A single value can't form a line (see toPoints) - a lone circle marker at
// least shows something instead of an invisible one-point polyline.
function singlePoint(values, w, h) {
  if (values.length !== 1) return null;
  const max = Math.max(values[0], 1);
  return { x: w / 2, y: h - (values[0] / max) * h };
}

export default function ExecutiveDashboard() {
  const [overview, setOverview] = useState(null);
  const [heatmap, setHeatmap] = useState([]);
  const [stateRankings, setStateRankings] = useState([]);
  const [monthlyTrend, setMonthlyTrend] = useState([]);
  const [sviTrend, setSviTrend] = useState([]);
  const [interventions, setInterventions] = useState([]);
  const [recoOverview, setRecoOverview] = useState([]);
  const [districtRisk, setDistrictRisk] = useState([]);
  const [mlopsEval, setMlopsEval] = useState(null);

  const reload = () => Promise.all([
    api.get('/api/analytics/overview'),
    api.get('/api/gis/heatmap'),
    api.get('/api/analytics/state-rankings'),
    api.get('/api/analytics/monthly-trend'),
    api.get('/api/analytics/svi-trend'),
    api.get('/api/interventions'),
    api.get('/api/analytics/recommendations-overview'),
    api.get('/api/analytics/district-risk'),
    api.get('/api/ai-monitoring/eval').catch(() => null),
  ]).then(([ov, gis, sr, mt, st, iv, reco, dr, ev]) => {
    setOverview(ov);
    setHeatmap(gis);
    setStateRankings(sr);
    setMonthlyTrend(mt);
    setSviTrend(st);
    setInterventions(iv);
    setRecoOverview(reco);
    setDistrictRisk(dr);
    setMlopsEval(ev);
  }).catch(() => {});

  useEffect(() => { reload(); }, []);

  // National KPIs and the intervention list shift with every new complaint
  // or re-scored assessment - same staleness class as RiskIntelligence.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;
    socket.on('assessment:new', reload);
    socket.on('complaint:new', reload);
    socket.on('case:status_changed', reload);
    return () => {
      socket.off('assessment:new', reload);
      socket.off('complaint:new', reload);
      socket.off('case:status_changed', reload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const kpis = overview ? [
    { label: 'Total Cases', value: overview.totalCases },
    { label: 'Active Critical', value: overview.activeCriticalCases },
    { label: 'Average SVI', value: overview.averageSvi },
    { label: 'Cases Resolved', value: overview.casesResolved },
    { label: 'Counselling Coverage', value: `${overview.counsellingCoveragePct}%` },
    { label: 'Avg Model Confidence', value: `${overview.averageModelConfidence}%` },
  ] : [];

  const byState = new Map();
  for (const h of heatmap) {
    const entry = byState.get(h.state) ?? { state: h.state, activeCases: 0, critical: 0 };
    entry.activeCases += h.activeCases;
    entry.critical += h.critical;
    byState.set(h.state, entry);
  }
  const stateHeatmap = Array.from(byState.values()).sort((a, b) => b.activeCases - a.activeCases);

  const topStates = stateRankings.slice(0, 10);
  const topStatesMax = topStates.length ? Math.max(...topStates.map((s) => s.activeCases), 1) : 1;

  const completedInterventions = interventions.filter((i) => i.status === 'completed').length;
  const interventionRate = interventions.length ? Math.round((100 * completedInterventions) / interventions.length) : null;

  const districtConcerns = districtRisk.slice(0, 3).map((d) => `${d.district}, ${d.state} has the highest average SVI (${d.avgSvi}) across ${d.assessmentCount} assessment(s).`);
  const resourceRecs = recoOverview.slice(0, 4).map((r) => `${r.count} case(s) recommend ${r.label}.`);
  const aiStatus = mlopsEval ? [`Illustrative regression pass rate: ${mlopsEval.pass_rate}% (${mlopsEval.passed}/${mlopsEval.total}).`, `Active model version: ${mlopsEval.model_version}.`] : [];

  return (
    <div className="tsa-fade">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 14, marginBottom: 18 }}>
        {kpis.map((ek) => (
          <div key={ek.label} style={{ background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 12, padding: 18 }}>
            <div style={{ fontSize: 11.5, color: '#8b91a3', marginBottom: 8 }}>{ek.label}</div>
            <div style={{ font: '700 26px Sora,sans-serif' }}>{ek.value}</div>
          </div>
        ))}
      </div>

      <div className="tsa-card-hover" style={{ ...card, marginBottom: 16 }}>
        <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 14 }}>National Risk Map</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(100px,1fr))', gap: 10 }}>
          {stateHeatmap.map((s) => (
            <div key={s.state} title={`${s.state}: ${s.activeCases} active cases, ${s.critical} critical`} style={{ background: 'rgba(255,255,255,.04)', borderRadius: 10, padding: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>{s.state}</div>
              <div style={{ font: '700 18px Sora,sans-serif', color: s.critical > 0 ? RISK_COLORS.CRITICAL : s.activeCases > 0 ? RISK_COLORS.HIGH : RISK_COLORS.LOW }}>{s.activeCases}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, height: 8, borderRadius: 4, background: 'linear-gradient(90deg,oklch(0.72 0.15 145),oklch(0.8 0.15 95),oklch(0.7 0.17 55),oklch(0.62 0.21 25))' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr .8fr', gap: 16, marginBottom: 16 }}>
        <div style={card}>
          <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 14 }}>Top High-Risk States (by active cases)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {topStates.map((ts) => (
              <div key={ts.state} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
                <div style={{ width: 110, color: '#c4c8d4' }}>{ts.state}</div>
                <div style={{ flex: 1, height: 7, borderRadius: 4, background: 'rgba(255,255,255,.06)', overflow: 'hidden' }}><div style={{ height: '100%', background: 'oklch(0.6 0.15 235)', width: `${(100 * ts.activeCases) / topStatesMax}%` }} /></div>
                <div style={{ width: 32, textAlign: 'right' }}>{ts.activeCases}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={card}>
          <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 14 }}>State Comparison Rankings</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {stateRankings.slice(0, 8).map((sr, i) => (
              <div key={sr.state} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
                <div>#{i + 1} {sr.state}</div>
                <div style={{ display: 'flex', gap: 10, color: '#8b91a3' }}><span>{sr.activeCases} active</span><span style={{ color: sr.criticalCases > 0 ? RISK_COLORS.CRITICAL : RISK_COLORS.LOW }}>{sr.criticalCases} critical</span></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div style={{ background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 14, padding: 20 }}>
          <div style={{ font: '600 13px Sora,sans-serif', marginBottom: 12 }}>Monthly Complaint Trend</div>
          <svg viewBox="0 0 260 90" style={{ width: '100%', height: 90 }}>
            <polyline points={toPoints(monthlyTrend.map((m) => m.count), 260, 90)} fill="none" stroke="oklch(0.62 0.16 235)" strokeWidth="2.5"><title>Monthly complaint volume nationally</title></polyline>
            {(() => { const p = singlePoint(monthlyTrend.map((m) => m.count), 260, 90); return p && <circle cx={p.x} cy={p.y} r="4" fill="oklch(0.62 0.16 235)" />; })()}
          </svg>
        </div>
        <div style={{ background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 14, padding: 20 }}>
          <div style={{ font: '600 13px Sora,sans-serif', marginBottom: 12 }}>SVI Trend</div>
          <svg viewBox="0 0 260 90" style={{ width: '100%', height: 90 }}>
            <polyline points={toPoints(sviTrend.map((s) => s.avgSvi), 260, 90)} fill="none" stroke="oklch(0.7 0.17 55)" strokeWidth="2.5"><title>Weekly average SVI</title></polyline>
            {(() => { const p = singlePoint(sviTrend.map((s) => s.avgSvi), 260, 90); return p && <circle cx={p.x} cy={p.y} r="4" fill="oklch(0.7 0.17 55)" />; })()}
          </svg>
        </div>
        <div style={{ background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 14, padding: 20 }}>
          <div style={{ font: '600 13px Sora,sans-serif', marginBottom: 12 }}>Intervention Completion Rate</div>
          {interventionRate === null ? (
            <div style={{ fontSize: 12, color: '#5c6178' }}>No interventions tracked yet.</div>
          ) : (
            <>
              <div style={{ font: '700 32px Sora,sans-serif', color: RISK_COLORS.LOW }}>{interventionRate}%</div>
              <div style={{ fontSize: 11.5, color: '#8b91a3', marginTop: 6 }}>{completedInterventions} of {interventions.length} completed</div>
            </>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 14 }}>
        <div style={{ background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 14, padding: 20 }}>
          <div style={{ font: '600 13px Sora,sans-serif', marginBottom: 12, color: 'oklch(0.65 0.14 200)' }}>Recommended Resource Demand</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {recoOverview.length === 0 && <div style={{ fontSize: 12, color: '#5c6178' }}>No recommendations yet.</div>}
            {recoOverview.map((r) => (
              <div key={r.type}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 3 }}>
                  <div style={{ color: '#c4c8d4' }}>{r.label}</div><div style={{ color: '#8b91a3' }}>{r.count}</div>
                </div>
                <div style={{ height: 6, borderRadius: 4, background: 'rgba(255,255,255,.06)' }}>
                  <div style={{ height: '100%', borderRadius: 4, background: 'oklch(0.65 0.14 200)', width: `${(100 * r.count) / (recoOverview[0]?.count || 1)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <InsightCard
          title="National Situation Summary"
          color="oklch(0.75 0.13 200)"
          items={overview ? [`${overview.totalCases} total cases nationally with ${overview.activeCriticalCases} at critical risk. Average model confidence holds at ${overview.averageModelConfidence}%, and counselling coverage stands at ${overview.counsellingCoveragePct}% of assessed victims.`] : []}
        />
        <InsightCard title="Highest-Risk Districts" color="oklch(0.8 0.15 95)" items={districtConcerns} />
        <InsightCard title="Resource Allocation Recommendations" color="oklch(0.65 0.14 200)" items={resourceRecs} />
        <InsightCard title="AI System Status" color="oklch(0.72 0.15 145)" items={aiStatus} />
      </div>
    </div>
  );
}
