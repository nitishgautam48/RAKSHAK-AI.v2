import { useEffect, useState } from 'react';
import Hoverable from '../components/Hoverable';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';

const card = { background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 14, padding: 22 };
const RISK_COLORS = { LOW: 'oklch(0.72 0.15 145)', MODERATE: 'oklch(0.8 0.15 95)', HIGH: 'oklch(0.7 0.17 55)', CRITICAL: 'oklch(0.62 0.21 25)' };

export default function DashboardOverview() {
  const [booting, setBooting] = useState(true);
  const [overview, setOverview] = useState(null);
  const [riskDist, setRiskDist] = useState(null);
  const [hotspots, setHotspots] = useState([]);
  const [sviTrend, setSviTrend] = useState([]);
  const [weeklyActivity, setWeeklyActivity] = useState([]);
  const [recoOverview, setRecoOverview] = useState([]);
  const [liveFeed, setLiveFeed] = useState([]);

  useEffect(() => {
    Promise.all([
      api.get('/api/analytics/overview'),
      api.get('/api/analytics/risk-distribution'),
      api.get('/api/gis/heatmap'),
      api.get('/api/analytics/svi-trend'),
      api.get('/api/analytics/weekly-activity'),
      api.get('/api/analytics/recommendations-overview'),
    ])
      .then(([ov, rd, gis, trend, weekly, reco]) => {
        setOverview(ov);
        setRiskDist(rd);
        setHotspots(gis.slice(0, 6));
        setSviTrend(trend);
        setWeeklyActivity(weekly);
        setRecoOverview(reco);
      })
      .catch(() => {})
      .finally(() => setBooting(false));
  }, []);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const pushFeed = (text, color) => setLiveFeed((f) => [{ text, color, time: 'just now', id: Math.random() }, ...f].slice(0, 8));
    const onSos = () => pushFeed('New SOS alert received', 'oklch(0.62 0.21 25)');
    const onComplaint = (p) => pushFeed(`New complaint ${p?.complaint?.code ?? ''} registered`, 'oklch(0.7 0.17 55)');
    const onAssessment = (p) => pushFeed(`AI assessment completed - SVI ${p?.svi?.value ?? '?'} (${p?.svi?.band ?? '?'})`, 'oklch(0.65 0.14 200)');
    socket.on('sos:new', onSos);
    socket.on('complaint:new', onComplaint);
    socket.on('assessment:new', onAssessment);
    return () => {
      socket.off('sos:new', onSos);
      socket.off('complaint:new', onComplaint);
      socket.off('assessment:new', onAssessment);
    };
  }, []);

  const kpis = overview ? [
    { label: 'Total Cases', value: overview.totalCases, color: '#eef0f6' },
    { label: 'Active Critical', value: overview.activeCriticalCases, color: RISK_COLORS.CRITICAL },
    { label: 'Average SVI', value: overview.averageSvi, color: RISK_COLORS.MODERATE },
    { label: 'Cases Resolved', value: overview.casesResolved, color: RISK_COLORS.LOW },
    { label: 'Counselling Coverage', value: `${overview.counsellingCoveragePct}%`, color: 'oklch(0.65 0.14 200)' },
  ] : [];

  const riskTotal = riskDist ? Object.values(riskDist).reduce((a, b) => a + b, 0) || 1 : 1;
  const hotspotMax = hotspots.length ? Math.max(...hotspots.map((h) => h.activeCases), 1) : 1;
  const weeklyMax = weeklyActivity.length ? Math.max(...weeklyActivity.map((d) => d.count), 1) : 1;
  const recoMax = recoOverview.length ? Math.max(...recoOverview.map((r) => r.count), 1) : 1;

  // A single data point can't describe a trend line - the old code fed it
  // through the same "line + baseline-to-baseline fill" path used for 2+
  // points, which drew a meaningless triangle (one point joined straight
  // down to both bottom corners) rather than an empty/no-trend state.
  const singleTrendPoint = sviTrend.length === 1
    ? { x: 300, y: 160 - (sviTrend[0].avgSvi / 100) * 150 - 5 }
    : null;
  const trendPoints = sviTrend.length > 1
    ? sviTrend.map((w, i) => {
        const x = (i / (sviTrend.length - 1)) * 600;
        const y = 160 - (w.avgSvi / 100) * 150 - 5;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ')
    : '';
  const trendArea = trendPoints ? `0,160 ${trendPoints} 600,160` : '';

  return (
    <div className="tsa-fade">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 14, marginBottom: 20 }}>
        {booting
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 12, padding: 16 }}>
                <div className="tsa-skeleton" style={{ height: 11, width: '70%', borderRadius: 4, marginBottom: 12 }} />
                <div className="tsa-skeleton" style={{ height: 22, width: '50%', borderRadius: 4 }} />
              </div>
            ))
          : kpis.map((k) => (
              <Hoverable
                key={k.label}
                style={{ background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 12, padding: 16, transition: 'border-color .15s,transform .15s' }}
                hoverStyle={{ borderColor: 'rgba(255,255,255,.16)', transform: 'translateY(-2px)' }}
              >
                <div style={{ fontSize: 11.5, color: '#8b91a3', marginBottom: 8 }}>{k.label}</div>
                <div style={{ font: '700 24px Sora,sans-serif', color: k.color }}>{k.value}</div>
              </Hoverable>
            ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr .7fr', gap: 16, marginBottom: 16 }}>
        <div style={card}>
          <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 16 }}>SVI Trend ({sviTrend.length || 0} weeks with data)</div>
          {trendPoints ? (
            <svg viewBox="0 0 600 160" style={{ width: '100%', height: 160 }}>
              <defs>
                <linearGradient id="sviTrendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="oklch(0.62 0.16 235)" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="oklch(0.62 0.16 235)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <line x1="0" y1="15" x2="600" y2="15" stroke="rgba(255,255,255,.06)" strokeWidth="1" />
              <line x1="0" y1="80" x2="600" y2="80" stroke="rgba(255,255,255,.06)" strokeWidth="1" />
              <line x1="0" y1="145" x2="600" y2="145" stroke="rgba(255,255,255,.06)" strokeWidth="1" />
              <polyline points={trendArea} fill="url(#sviTrendFill)" stroke="none" />
              <polyline points={trendPoints} fill="none" stroke="oklch(0.62 0.16 235)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : singleTrendPoint ? (
            <svg viewBox="0 0 600 160" style={{ width: '100%', height: 160 }}>
              <circle cx={singleTrendPoint.x} cy={singleTrendPoint.y} r="5" fill="oklch(0.62 0.16 235)" />
              <text x={singleTrendPoint.x} y={singleTrendPoint.y - 14} textAnchor="middle" fontSize="12" fill="#8b91a3">
                {Math.round(sviTrend[0].avgSvi)} avg SVI - need a 2nd week to show a trend
              </text>
            </svg>
          ) : (
            <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5c6178', fontSize: 12.5 }}>No scored assessments yet.</div>
          )}
        </div>
        <div style={card}>
          <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 16 }}>Risk Distribution</div>
          {riskDist && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Object.entries(riskDist).map(([label, count]) => (
                <div key={label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 8, height: 8, borderRadius: 2, background: RISK_COLORS[label] }} />{label}</div>
                    <div style={{ color: '#8b91a3' }}>{count}</div>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,.06)' }}>
                    <div style={{ height: '100%', borderRadius: 3, background: RISK_COLORS[label], width: `${(100 * count) / riskTotal}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div style={card}>
          <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 16 }}>Weekly Complaint Volume</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120 }}>
            {weeklyActivity.map((wb) => (
              <div key={wb.date} title={`${wb.count} complaint(s)`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, justifyContent: 'flex-end', height: '100%' }}>
                <div style={{ width: '100%', borderRadius: '4px 4px 0 0', background: 'oklch(0.55 0.15 235)', height: `${Math.max(4, (100 * wb.count) / weeklyMax)}%` }} />
                <div style={{ fontSize: 10.5, color: '#7d8399' }}>{wb.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={card}>
          <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 14 }}>Live Activity Feed</div>
          <div className="tsa-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 140, overflowY: 'auto' }}>
            {liveFeed.length === 0 && <div style={{ fontSize: 12, color: '#5c6178' }}>No live activity yet this session. New complaints, assessments and SOS alerts appear here in real time.</div>}
            {liveFeed.map((al) => (
              <div key={al.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 12.5 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: al.color, marginTop: 5, flex: 'none' }} />
                <div><span style={{ color: '#eef0f6' }}>{al.text}</span> <span style={{ color: '#5c6178' }}>&middot; {al.time}</span></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={card}>
          <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 14 }}>AI Recommendations Overview</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {recoOverview.length === 0 && <div style={{ fontSize: 12, color: '#5c6178' }}>No recommendations generated yet.</div>}
            {recoOverview.map((ro) => (
              <div key={ro.type}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, marginBottom: 4 }}>
                  <div>{ro.label}</div>
                  <div style={{ color: 'oklch(0.7 0.13 200)', fontWeight: 600 }}>{ro.count}</div>
                </div>
                <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,.06)' }}>
                  <div style={{ height: '100%', borderRadius: 3, background: 'oklch(0.65 0.14 200)', width: `${(100 * ro.count) / recoMax}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={card}>
          <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 14 }}>Geographic Hotspots</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {hotspots.length === 0 && <div style={{ fontSize: 12, color: '#5c6178' }}>No active cases recorded yet.</div>}
            {hotspots.map((h) => (
              <div key={`${h.state}-${h.district}`} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
                <div style={{ width: 90, color: '#8b91a3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.district}</div>
                <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,.06)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: h.critical ? RISK_COLORS.CRITICAL : h.high ? RISK_COLORS.HIGH : RISK_COLORS.MODERATE, width: `${(100 * h.activeCases) / hotspotMax}%` }} />
                </div>
                <div style={{ width: 28, textAlign: 'right' }}>{h.activeCases}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
