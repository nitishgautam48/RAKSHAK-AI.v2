export default function Placeholder({ label }) {
  return (
    <div
      className="tsa-fade"
      style={{
        background: 'rgba(255,255,255,.035)', border: '1px dashed rgba(255,255,255,.15)', borderRadius: 14,
        padding: 40, textAlign: 'center', maxWidth: 560, margin: '40px auto',
      }}
    >
      <div style={{ font: '600 16px Sora,sans-serif', marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 13, color: '#8b91a3', lineHeight: 1.6 }}>
        This module is part of the full TraumaSense AI design and is planned for a follow-up implementation pass.
      </div>
    </div>
  );
}
