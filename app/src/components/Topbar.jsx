import Hoverable from './Hoverable';
import { LANGS } from '../data/constants';

export default function Topbar({ title, role, userName, lang, onLangChange, onLogout, onOpenMobileSidebar }) {
  const roleLabel = (role || '').replace(/_/g, ' ').replace(/\w\S*/g, (w) => w.charAt(0) + w.slice(1).toLowerCase());
  const initialsSource = userName || roleLabel || 'U';
  const userInitials = initialsSource.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div style={{ height: 64, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', borderBottom: '1px solid rgba(255,255,255,.06)', background: 'rgba(255,255,255,.015)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button
          className="tsa-hamburger"
          onClick={onOpenMobileSidebar}
          aria-label="Open menu"
          style={{ display: 'none', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 8, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.04)', color: '#eef0f6', cursor: 'pointer', flex: 'none' }}
        >
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
        </button>
        <div style={{ font: '700 17px Sora,sans-serif' }}>{title}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, position: 'relative' }}>
        <select value={lang} onChange={onLangChange} style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', color: '#eef0f6', fontSize: 12.5, padding: '8px 10px', borderRadius: 7, cursor: 'pointer' }}>
          {LANGS.map((l) => (
            <option key={l} value={l} style={{ background: '#171a24', color: '#eef0f6' }}>{l}</option>
          ))}
        </select>
        <div style={{ fontSize: 12.5, color: '#8b91a3', padding: '8px 10px', borderRadius: 7, background: 'rgba(255,255,255,.04)' }}>{roleLabel}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 14, borderLeft: '1px solid rgba(255,255,255,.08)' }}>
          <div title={userName} style={{ width: 30, height: 30, borderRadius: '50%', background: 'oklch(0.5 0.1 235)', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '600 12px Sora,sans-serif' }}>{userInitials}</div>
          {onLogout && (
            <Hoverable as="button" onClick={onLogout} style={{ fontSize: 11.5, color: '#7d8399', background: 'none', border: 'none', cursor: 'pointer' }} hoverStyle={{ color: '#eef0f6' }}>
              Logout
            </Hoverable>
          )}
        </div>
      </div>
    </div>
  );
}
