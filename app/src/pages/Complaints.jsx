import { useEffect, useState, useCallback } from 'react';
import Hoverable from '../components/Hoverable';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';

const selectStyle = { background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', color: '#eef0f6', fontSize: 12.5, padding: '8px 12px', borderRadius: 7 };
// Keyed to the backend's RiskLevel enum (LOW/MODERATE/HIGH/CRITICAL), not
// the Capitalized keys in data/constants.js's mock-data RISK_COLORS/RISK_BG.
const RISK_COLORS = { LOW: 'oklch(0.72 0.15 145)', MODERATE: 'oklch(0.8 0.15 95)', HIGH: 'oklch(0.7 0.17 55)', CRITICAL: 'oklch(0.62 0.21 25)' };
const RISK_BG = { LOW: 'oklch(0.72 0.15 145 / 0.15)', MODERATE: 'oklch(0.8 0.15 95 / 0.15)', HIGH: 'oklch(0.7 0.17 55 / 0.15)', CRITICAL: 'oklch(0.62 0.21 25 / 0.15)' };

const RISK_OPTIONS = ['All Risk Levels', 'LOW', 'MODERATE', 'HIGH', 'CRITICAL'];
const STATUS_OPTIONS = ['All Statuses', 'SUBMITTED', 'UNDER_REVIEW', 'ASSIGNED', 'UNDER_INVESTIGATION', 'ESCALATED', 'CLOSED'];
const ALL_STATES = 'All States';
const ALL_DISTRICTS = 'All Districts';

const DEFAULTS = { filterRisk: 'All Risk Levels', filterStatus: 'All Statuses', filterSearch: '', filterState: ALL_STATES, filterDistrict: ALL_DISTRICTS };

const columns = '110px 1fr 1fr 1fr .9fr 1fr 1fr 1.4fr';

export default function Complaints() {
  const [filters, setFilters] = useState(DEFAULTS);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [geography, setGeography] = useState({ states: [], districtsByState: {} });
  const patch = (p) => setFilters((f) => ({ ...f, ...p }));

  useEffect(() => {
    api.get('/api/meta/geography').then(setGeography).catch(() => {});
  }, []);

  const { filterRisk, filterStatus, filterSearch, filterState, filterDistrict } = filters;
  const districtOptions = filterState === ALL_STATES ? [] : (geography.districtsByState[filterState] ?? []);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterRisk !== 'All Risk Levels') params.set('riskLevel', filterRisk);
    if (filterStatus !== 'All Statuses') params.set('status', filterStatus);
    if (filterSearch) params.set('search', filterSearch);
    if (filterState !== ALL_STATES) params.set('state', filterState);
    if (filterDistrict !== ALL_DISTRICTS) params.set('district', filterDistrict);
    params.set('pageSize', '50');
    api.get(`/api/complaints?${params.toString()}`)
      .then((r) => setItems(r.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [filterRisk, filterStatus, filterSearch, filterState, filterDistrict]);

  useEffect(() => { load(); }, [load]);

  // Previously fetched once on mount and never again - a complaint filed
  // (or re-scored) by anyone else while this page was open simply never
  // appeared until a manual reload. Reuses the same `load` this page
  // already calls on filter changes, so a live event applies the current
  // filters too rather than bypassing them.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;
    socket.on('complaint:new', load);
    socket.on('complaint:linked', load);
    socket.on('assessment:new', load);
    socket.on('case:status_changed', load);
    return () => {
      socket.off('complaint:new', load);
      socket.off('complaint:linked', load);
      socket.off('assessment:new', load);
      socket.off('case:status_changed', load);
    };
  }, [load]);

  const activeFilterChips = [
    filterRisk !== 'All Risk Levels' && { key: 'filterRisk', label: 'Risk: ' + filterRisk },
    filterStatus !== 'All Statuses' && { key: 'filterStatus', label: 'Status: ' + filterStatus },
    filterSearch && { key: 'filterSearch', label: 'Search: ' + filterSearch },
    filterState !== ALL_STATES && { key: 'filterState', label: 'State: ' + filterState },
    filterDistrict !== ALL_DISTRICTS && { key: 'filterDistrict', label: 'District: ' + filterDistrict },
  ].filter(Boolean);

  const toggleView = async (id) => {
    if (expandedId === id) { setExpandedId(null); setDetail(null); return; }
    setExpandedId(id);
    setDetail(null);
    try {
      const d = await api.get(`/api/complaints/${id}`);
      setDetail(d);
    } catch {
      setDetail({ error: true });
    }
  };

  const escalate = async (id) => {
    await api.patch(`/api/complaints/${id}/escalate`, {});
    load();
  };

  return (
    <div className="tsa-fade">
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <input value={filterSearch} onChange={(e) => patch({ filterSearch: e.target.value })} placeholder="Search complaint code..." style={{ ...selectStyle, minWidth: 180 }} />
        <select value={filterRisk} onChange={(e) => patch({ filterRisk: e.target.value })} style={selectStyle}>
          {RISK_OPTIONS.map((r) => <option key={r} value={r} style={{ background: '#171a24', color: '#eef0f6' }}>{r}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => patch({ filterStatus: e.target.value })} style={selectStyle}>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s} style={{ background: '#171a24', color: '#eef0f6' }}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <select value={filterState} onChange={(e) => patch({ filterState: e.target.value, filterDistrict: ALL_DISTRICTS })} style={selectStyle}>
          <option value={ALL_STATES} style={{ background: '#171a24', color: '#eef0f6' }}>{ALL_STATES}</option>
          {geography.states.map((s) => <option key={s} value={s} style={{ background: '#171a24', color: '#eef0f6' }}>{s}</option>)}
        </select>
        <select value={filterDistrict} onChange={(e) => patch({ filterDistrict: e.target.value })} disabled={filterState === ALL_STATES} style={{ ...selectStyle, opacity: filterState === ALL_STATES ? 0.5 : 1 }}>
          <option value={ALL_DISTRICTS} style={{ background: '#171a24', color: '#eef0f6' }}>{ALL_DISTRICTS}</option>
          {districtOptions.map((d) => <option key={d} value={d} style={{ background: '#171a24', color: '#eef0f6' }}>{d}</option>)}
        </select>
        <Hoverable
          as="button"
          onClick={() => setFilters(DEFAULTS)}
          style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', color: '#c4c8d4', fontSize: 12, padding: '8px 14px', borderRadius: 7, cursor: 'pointer', transition: 'border-color .15s' }}
          hoverStyle={{ borderColor: 'rgba(255,255,255,.3)' }}
        >
          Clear Filters
        </Hoverable>
      </div>

      {activeFilterChips.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ fontSize: 11, color: '#5c6178' }}>Active filters:</div>
          {activeFilterChips.map((fc) => (
            <div
              key={fc.key}
              onClick={() => patch(fc.key === 'filterState' ? { filterState: ALL_STATES, filterDistrict: ALL_DISTRICTS } : { [fc.key]: DEFAULTS[fc.key] })}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 20, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', fontSize: 11.5, color: '#eef0f6', cursor: 'pointer' }}
            >
              {fc.label} <span style={{ color: '#7d8399' }}>&times;</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: columns, gap: 12, padding: '12px 18px', background: 'rgba(255,255,255,.03)', fontSize: 11, color: '#7d8399', fontWeight: 600 }}>
          <div>Code</div><div>Victim</div><div>District</div><div>State</div><div>Language</div><div>Risk</div><div>Status</div><div>Actions</div>
        </div>
        {loading && <div style={{ padding: 24, textAlign: 'center', color: '#7d8399', fontSize: 13 }}>Loading complaints…</div>}
        {!loading && items.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: '#7d8399', fontSize: 13 }}>No complaints match these filters.</div>}
        {items.map((c) => (
          <div key={c.id}>
            <Hoverable
              style={{ display: 'grid', gridTemplateColumns: columns, gap: 12, padding: '13px 18px', borderTop: '1px solid rgba(255,255,255,.05)', fontSize: 12.5, alignItems: 'center', whiteSpace: 'nowrap', overflow: 'hidden', transition: 'background .15s' }}
              hoverStyle={{ background: 'rgba(255,255,255,.03)' }}
            >
              <div style={{ color: '#7d8399', fontFamily: "'IBM Plex Mono',monospace", overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.code}</div>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.victimDisplayCode}</div>
              <div style={{ color: '#c4c8d4', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.district}</div>
              <div style={{ color: '#c4c8d4', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.state}</div>
              <div style={{ color: '#c4c8d4', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.language}</div>
              <div><span style={{ padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: RISK_BG[c.riskLevel], color: RISK_COLORS[c.riskLevel] }}>{c.riskLevel}</span></div>
              <div style={{ color: '#c4c8d4', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.status.replace(/_/g, ' ')}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Hoverable as="div" onClick={() => toggleView(c.id)} style={{ cursor: 'pointer', color: 'oklch(0.72 0.13 200)', fontSize: 11.5, transition: 'opacity .15s' }} hoverStyle={{ opacity: 0.7 }}>{expandedId === c.id ? 'Hide' : 'View'}</Hoverable>
                <Hoverable as="div" onClick={() => escalate(c.id)} style={{ cursor: 'pointer', color: 'oklch(0.7 0.17 55)', fontSize: 11.5, transition: 'opacity .15s' }} hoverStyle={{ opacity: 0.7 }}>Escalate</Hoverable>
              </div>
            </Hoverable>
            {expandedId === c.id && (
              <div style={{ padding: '14px 18px', borderTop: '1px solid rgba(255,255,255,.05)', background: 'rgba(255,255,255,.02)', fontSize: 12.5 }}>
                {!detail && <div style={{ color: '#7d8399' }}>Loading detail…</div>}
                {detail?.error && <div style={{ color: '#7d8399' }}>Could not load detail.</div>}
                {detail && !detail.error && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <div style={{ color: '#8b91a3', marginBottom: 4 }}>Incident Type</div>
                      <div style={{ marginBottom: 10 }}>{detail.incidentType}</div>
                      <div style={{ color: '#8b91a3', marginBottom: 4 }}>Narrative</div>
                      <div style={{ lineHeight: 1.6, color: '#c4c8d4' }}>{detail.narrative}</div>
                    </div>
                    <div>
                      <div style={{ color: '#8b91a3', marginBottom: 4 }}>Case</div>
                      <div style={{ marginBottom: 10 }}>{detail.case ? `${detail.case.caseNumber} · ${detail.case.status.replace(/_/g, ' ')}` : 'No case opened yet'}</div>
                      <div style={{ color: '#8b91a3', marginBottom: 4 }}>Latest AI Assessment</div>
                      {detail.assessments?.[0] ? (
                        <div style={{ color: '#c4c8d4' }}>Assessed {new Date(detail.assessments[0].createdAt).toLocaleString()}</div>
                      ) : (
                        <div style={{ color: '#5c6178' }}>No assessment run yet - submit one from Real-Time Assessment.</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
