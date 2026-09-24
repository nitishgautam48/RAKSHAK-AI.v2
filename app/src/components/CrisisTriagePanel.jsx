// crisis_triage_engine.py exists specifically so staff don't have to
// mentally correlate 3 separate fields (emotional distress under `emotion`,
// suicidal-ideation flag and threat score under `nlp`) themselves - it was
// computed on every single assessment already, just never rendered
// anywhere. This is that missing render.
const LEVEL_META = {
  NONE: { color: '#5c6178', bg: 'rgba(255,255,255,.04)', label: 'No elevated crisis signals' },
  ELEVATED: { color: 'oklch(0.8 0.15 95)', bg: 'oklch(0.8 0.15 95 / 0.1)', label: 'Elevated' },
  HIGH: { color: 'oklch(0.7 0.17 55)', bg: 'oklch(0.7 0.17 55 / 0.1)', label: 'High' },
  CRITICAL: { color: 'oklch(0.62 0.21 25)', bg: 'oklch(0.62 0.21 25 / 0.14)', label: 'Critical' },
};

export default function CrisisTriagePanel({ triage }) {
  if (!triage) return null;
  const meta = LEVEL_META[triage.level] ?? LEVEL_META.NONE;

  return (
    <div style={{ background: meta.bg, border: `1px solid ${meta.color}`, borderRadius: 14, padding: 18, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ font: '700 13px Sora,sans-serif', color: meta.color }}>Crisis Triage: {meta.label}</div>
        <div style={{ fontSize: 12, color: '#8b91a3' }}>Score {triage.score}</div>
      </div>
      <div style={{ fontSize: 10.5, color: '#7d8399', marginBottom: 10, lineHeight: 1.5 }}>
        A triage overlay, not a new severity score - combines emotional distress, suicidal-ideation, and threat-from-another-party into one verdict.
      </div>
      {triage.reasons?.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {triage.reasons.map((r, i) => (
            <div key={i} style={{ fontSize: 12, color: '#c4c8d4' }}>&middot; {r}</div>
          ))}
        </div>
      )}
    </div>
  );
}
