import { useEffect, useMemo, useState } from 'react';
import Hoverable from '../components/Hoverable';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';

const card = { background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 14, padding: 22 };
const selectStyle = { background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', color: '#eef0f6', fontSize: 12.5, padding: '8px 12px', borderRadius: 7 };
const RISK_COLORS = { LOW: 'oklch(0.72 0.15 145)', MODERATE: 'oklch(0.8 0.15 95)', HIGH: 'oklch(0.7 0.17 55)', CRITICAL: 'oklch(0.62 0.21 25)' };

function bandFor(critical, high, activeCases) {
  if (critical > 0) return 'CRITICAL';
  if (high > 0) return 'HIGH';
  if (activeCases > 0) return 'MODERATE';
  return 'LOW';
}

export default function GeographicIntelligence() {
  const [heatmap, setHeatmap] = useState([]);
  const [districtRisk, setDistrictRisk] = useState([]);
  const [centers, setCenters] = useState([]);
  const [selectedState, setSelectedState] = useState(null);
  const [geography, setGeography] = useState({ states: [] });

  const reload = () => Promise.all([
    api.get('/api/gis/heatmap'),
    api.get('/api/analytics/district-risk'),
    api.get('/api/meta/geography'),
  ]).then(([hm, dr, geo]) => { setHeatmap(hm); setDistrictRisk(dr); setGeography(geo); }).catch(() => {});

  useEffect(() => { reload(); }, []);

  // Every new complaint or re-scored assessment shifts a district's active-
  // case count and risk band on this map - same staleness class as
  // RiskIntelligence/ExecutiveDashboard, and the one the user specifically
  // flagged as stale.
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

  useEffect(() => {
    const params = selectedState ? `?state=${encodeURIComponent(selectedState)}` : '';
    api.get(`/api/gis/support-centers${params}`).then(setCenters).catch(() => setCenters([]));
  }, [selectedState]);

  // Real pan-India state list, merged with real live case counts where they
  // exist (most states show 0 active cases - that's honest, not every state
  // has reported cases in this dataset - rather than omitting them entirely).
  const byState = useMemo(() => {
    const m = new Map();
    for (const s of geography.states) m.set(s, { state: s, activeCases: 0, critical: 0, high: 0 });
    for (const h of heatmap) {
      const entry = m.get(h.state) ?? { state: h.state, activeCases: 0, critical: 0, high: 0 };
      entry.activeCases += h.activeCases;
      entry.critical += h.critical;
      entry.high += h.high;
      m.set(h.state, entry);
    }
    return Array.from(m.values()).sort((a, b) => b.activeCases - a.activeCases);
  }, [heatmap, geography]);

  const stateDistricts = useMemo(
    () => (selectedState ? heatmap.filter((h) => h.state === selectedState).sort((a, b) => b.activeCases - a.activeCases) : []),
    [heatmap, selectedState],
  );

  const topDistricts = districtRisk.slice(0, 8);

  return (
    <div className="tsa-fade">
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={selectedState ?? ''} onChange={(e) => setSelectedState(e.target.value || null)} style={selectStyle}>
          <option value="" style={{ background: '#171a24' }}>All States</option>
          {byState.map((s) => <option key={s.state} value={s.state} style={{ background: '#171a24' }}>{s.state}</option>)}
        </select>
        <div style={{ marginLeft: 'auto', padding: '5px 12px', borderRadius: 20, background: 'oklch(0.65 0.14 200 / 0.12)', border: '1px solid oklch(0.65 0.14 200 / 0.3)', color: 'oklch(0.75 0.13 200)', fontSize: 11, fontWeight: 600 }}>Live from real case + GIS data</div>
      </div>

      {selectedState && (
        <div className="tsa-card-hover" style={{ ...card, padding: 20, marginBottom: 16 }}>
          <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 14 }}>Region Detail — {selectedState}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 16, marginBottom: 16 }}>
            {stateDistricts.map((d) => (
              <div key={d.district} style={{ background: 'rgba(255,255,255,.03)', borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{d.district}</div>
                <div style={{ font: '700 18px Sora,sans-serif', color: RISK_COLORS[bandFor(d.critical, d.high, d.activeCases)] }}>{d.activeCases}</div>
                <div style={{ fontSize: 10.5, color: '#8b91a3' }}>active cases &middot; {d.critical} critical</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr .8fr', gap: 16, marginBottom: 16 }}>
        <div style={card}>
          <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 16 }}>Interactive State Risk Map &middot; click a state to drill down</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 10 }}>
            {byState.map((s) => {
              const selected = selectedState === s.state;
              const color = RISK_COLORS[bandFor(s.critical, s.high, s.activeCases)];
              return (
                <Hoverable
                  key={s.state}
                  onClick={() => setSelectedState(selected ? null : s.state)}
                  style={{ background: 'rgba(255,255,255,.04)', borderRadius: 10, padding: 14, textAlign: 'center', cursor: 'pointer', border: selected ? `2px solid ${color}` : '2px solid transparent', transition: 'border-color .15s,transform .15s' }}
                  hoverStyle={{ transform: 'translateY(-2px)' }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{s.state}</div>
                  <div style={{ font: '700 20px Sora,sans-serif', color }}>{s.activeCases}</div>
                  <div style={{ fontSize: 10.5, color: '#8b91a3' }}>active cases</div>
                </Hoverable>
              );
            })}
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, color: '#7d8399', marginBottom: 6 }}>Risk heat intensity</div>
            <div style={{ height: 8, borderRadius: 4, background: 'linear-gradient(90deg,oklch(0.72 0.15 145),oklch(0.8 0.15 95),oklch(0.7 0.17 55),oklch(0.62 0.21 25))' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: '#7d8399', marginTop: 4 }}>
              <div>Low</div><div>Moderate</div><div>High</div><div>Critical</div>
            </div>
          </div>
        </div>
        <div style={card}>
          <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 14 }}>Top High-Risk Districts (avg SVI)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {topDistricts.length === 0 && <div style={{ color: '#5c6178', fontSize: 12.5 }}>No scored assessments yet.</div>}
            {topDistricts.map((td) => (
              <div key={`${td.state}-${td.district}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                <div>{td.district} <span style={{ color: '#5c6178', fontSize: 11.5 }}>({td.state})</span></div>
                <div style={{ fontWeight: 600, color: td.avgSvi >= 55 ? RISK_COLORS.HIGH : RISK_COLORS.MODERATE }}>{td.avgSvi}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={card}>
        <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 4 }}>Support Centers {selectedState ? `in ${selectedState}` : 'nationally'}</div>
        <div style={{ fontSize: 11, color: '#5c6178', marginBottom: 14 }}>Police stations, counselling centers, legal aid offices and shelter homes</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 }}>
          {centers.length === 0 && <div style={{ color: '#5c6178', fontSize: 12.5 }}>No support centers on file for this selection.</div>}
          {centers.map((c) => (
            <div key={c.id} style={{ background: 'rgba(255,255,255,.03)', borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 10.5, color: '#7d8399', marginBottom: 4, textTransform: 'uppercase' }}>{c.type.replace(/_/g, ' ')}</div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{c.name}</div>
              <div style={{ fontSize: 11.5, color: '#8b91a3' }}>{c.district}, {c.state} &middot; {c.phone}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
