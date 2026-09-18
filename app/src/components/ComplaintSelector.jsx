export default function ComplaintSelector({ complaints, selectedId, onChange }) {
  return (
    <select
      value={selectedId}
      onChange={(e) => onChange(e.target.value)}
      style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', color: '#eef0f6', fontSize: 12.5, padding: '8px 12px', borderRadius: 7, minWidth: 260, marginBottom: 16 }}
    >
      {complaints.map((c) => (
        <option key={c.id} value={c.id} style={{ background: '#171a24' }}>{c.code} &middot; {c.victimDisplayCode} &middot; {c.district}</option>
      ))}
    </select>
  );
}
