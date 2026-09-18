import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';

const STATUS_COLORS = { uploaded: 'oklch(0.8 0.15 95)', verified: 'oklch(0.72 0.15 145)', rejected: 'oklch(0.62 0.21 25)' };
const STATUS_OPTIONS = ['All', 'uploaded', 'verified', 'rejected'];

export default function MyDocuments() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [openingId, setOpeningId] = useState(null);

  useEffect(() => {
    api.get('/api/documents').then(setDocuments).catch(() => setDocuments([])).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(
    () => documents
      .filter((d) => filterStatus === 'All' || d.status === filterStatus)
      .filter((d) => d.title.toLowerCase().includes(search.toLowerCase())),
    [documents, search, filterStatus],
  );

  const openFile = async (doc) => {
    setOpeningId(doc.id);
    try {
      const url = await api.getBlob(`/api/documents/${doc.id}/file`);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      // eslint-disable-next-line no-alert
      alert('Could not open this document.');
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <div className="tsa-fade" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ font: '700 20px Sora,sans-serif' }}>My Documents</div>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search documents..."
        style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', color: '#eef0f6', borderRadius: 10, padding: '12px 14px', fontSize: 14 }}
      />
      <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', color: '#eef0f6', borderRadius: 10, padding: '12px 14px', fontSize: 13 }}>
        {STATUS_OPTIONS.map((d) => <option key={d} value={d} style={{ background: '#171a24' }}>{d}</option>)}
      </select>

      {loading && <div style={{ color: '#8b91a3', fontSize: 13.5 }}>Loading…</div>}
      {!loading && filtered.length === 0 && (
        <div style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 16, padding: 18, color: '#8b91a3', fontSize: 13.5 }}>
          {documents.length === 0 ? 'No documents on file yet. Files you attach when filing a complaint will appear here.' : 'No documents match this search.'}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.map((doc) => (
          <div key={doc.id} style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.4, marginBottom: 8 }}>{doc.title}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ padding: '2px 9px', borderRadius: 20, fontSize: 10.5, fontWeight: 600, color: STATUS_COLORS[doc.status] ?? '#8b91a3', background: 'rgba(255,255,255,.06)', whiteSpace: 'nowrap' }}>{doc.status}</div>
              <div style={{ fontSize: 11.5, color: '#7d8399' }}>{doc.type.replace(/_/g, ' ')} &middot; {new Date(doc.createdAt).toLocaleDateString()}</div>
            </div>
            <div style={{ display: 'flex', gap: 14, fontSize: 12 }}>
              <div onClick={() => openFile(doc)} style={{ color: 'oklch(0.72 0.13 200)', cursor: 'pointer' }}>{openingId === doc.id ? 'Opening…' : 'View / Download'}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
