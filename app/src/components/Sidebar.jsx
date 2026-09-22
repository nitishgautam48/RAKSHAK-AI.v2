import Hoverable from './Hoverable';
import BrandMark from './BrandMark';
import { NAV } from '../data/constants';

export default function Sidebar({ page, onSelectPage, onExit, mobileOpen, onCloseMobile }) {
  return (
    <div
      className={`tsa-sidebar${mobileOpen ? ' tsa-sidebar-open' : ''}`}
      style={{ width: 272, flex: 'none', background: '#0a0c12', borderRight: '1px solid rgba(255,255,255,.06)', display: 'flex', flexDirection: 'column' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 18px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
        <BrandMark size={30} radius={8} />
        <div style={{ font: '700 15px Sora,sans-serif' }}>TraumaSense</div>
      </div>
      <div style={{ padding: '14px 16px 8px', font: "600 10.5px 'IBM Plex Mono',monospace", color: '#5c6178', letterSpacing: '1px' }}>MODULES</div>
      <div className="tsa-scroll" style={{ flex: 1, overflowY: 'auto', padding: '0 10px 14px' }}>
        {NAV.map((item) => {
          const active = page === item.key;
          return (
            <Hoverable
              key={item.key}
              onClick={() => { onSelectPage(item.key); onCloseMobile?.(); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8, cursor: 'pointer', marginBottom: 2,
                color: active ? '#eef0f6' : '#9096a8', background: active ? 'rgba(255,255,255,.06)' : 'transparent',
              }}
              hoverStyle={{ background: 'rgba(255,255,255,.07)' }}
            >
              <div style={{ width: 6, height: 6, borderRadius: 2, background: active ? 'oklch(0.68 0.15 235)' : '#3a3f52', flex: 'none' }} />
              <div style={{ fontSize: 13, fontWeight: active ? 600 : 400, whiteSpace: 'nowrap' }}>{item.label}</div>
            </Hoverable>
          );
        })}
      </div>
      <div style={{ padding: '14px 16px', borderTop: '1px solid rgba(255,255,255,.06)' }}>
        <Hoverable
          onClick={onExit}
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8, cursor: 'pointer', color: '#7d8399', fontSize: 13, transition: 'background .15s,color .15s' }}
          hoverStyle={{ background: 'rgba(255,255,255,.05)', color: '#eef0f6' }}
        >
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#5c6178' }} /> Exit to landing page
        </Hoverable>
      </div>
    </div>
  );
}
