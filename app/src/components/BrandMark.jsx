export default function BrandMark({ size = 34, radius = 9, background = 'linear-gradient(135deg,oklch(0.58 0.19 275),oklch(0.65 0.14 200))', color = '#fff', style }) {
  return (
    <div style={{ width: size, height: size, borderRadius: radius, background, display: 'flex', alignItems: 'center', justifyContent: 'center', color, flex: 'none', ...style }}>
      <svg viewBox="0 0 24 24" width="60%" height="60%" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 13h4.5l2 7 4-14 2 7h7.5" />
      </svg>
    </div>
  );
}
