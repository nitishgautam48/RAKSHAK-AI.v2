import { useAssessmentSelector } from '../lib/useAssessmentSelector';
import ComplaintSelector from '../components/ComplaintSelector';

const card = { background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 14, padding: 22 };

function toPoints(values, w, h) {
  if (!values || values.length === 0) return '';
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  return values.map((v, i) => {
    const x = (i / Math.max(1, values.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

export default function VoiceAnalysis() {
  const { complaints, selectedId, setSelectedId, assessment, engineOutputs, loading } = useAssessmentSelector();
  const voice = engineOutputs.voice;
  const voiceRecording = assessment?.voiceRecording;

  return (
    <div className="tsa-fade">
      <ComplaintSelector complaints={complaints} selectedId={selectedId} onChange={setSelectedId} />
      {loading && <div style={{ color: '#7d8399', fontSize: 13 }}>Loading…</div>}

      {!loading && !voice && (
        <div style={{ ...card, textAlign: 'center', padding: 40, color: '#7d8399' }}>
          {assessment ? (
            <>No audio was attached to this complaint's most recent assessment, so there is no voice signal to analyze. Attach an audio file from Real-Time Assessment to see real pitch/energy/pause DSP output here.</>
          ) : (
            <>No AI assessment has been run for this complaint yet.</>
          )}
        </div>
      )}

      {!loading && voice && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={card}>
              <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 14 }}>Energy Contour (real DSP output)</div>
              <svg viewBox="0 0 300 80" style={{ width: '100%', height: 80 }}>
                <polyline points={toPoints(voice.energyContour, 300, 80)} fill="none" stroke="oklch(0.65 0.14 200)" strokeWidth="2" />
              </svg>
              <div style={{ fontSize: 12, color: '#7d8399', marginTop: 10 }}>
                Language: <span style={{ color: '#eef0f6' }}>{voiceRecording?.languageCode ?? 'Unknown'}</span>
                {voiceRecording?.transcriptSrc && <> &middot; Transcript source: <span style={{ color: '#eef0f6' }}>{voiceRecording.transcriptSrc.replace(/_/g, ' ')}</span></>}
              </div>
            </div>
            {voiceRecording?.transcript && (
              <div style={card}>
                <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 12 }}>Transcript</div>
                <div style={{ fontSize: 13, lineHeight: 1.7, color: '#c4c8d4' }}>{voiceRecording.transcript}</div>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={card}>
              <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 14 }}>Pitch Contour (autocorrelation, real DSP)</div>
              <svg viewBox="0 0 300 100" style={{ width: '100%', height: 100 }}>
                <polyline points={toPoints(voice.pitchContour, 300, 100)} fill="none" stroke="oklch(0.7 0.17 55)" strokeWidth="2" />
              </svg>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#7d8399', marginTop: 8 }}>
                <div>Voice Stress</div><div style={{ color: 'oklch(0.7 0.17 55)', fontWeight: 600 }}>{voice.voiceStress} ({voice.voiceStressScore})</div>
              </div>
            </div>
            <div style={{ ...card, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {[
                ['Speech Tremor', voice.speechTremor],
                ['Pause Frequency', voice.pauseFrequency],
                ['Fear Indicator Spikes', voice.fearIndicatorCount],
                ['Speaking Speed', voice.speakingSpeedWpm ? `${voice.speakingSpeedWpm} wpm` : 'N/A'],
                ['Confidence', `${voice.confidenceScore}%`],
              ].map(([label, value]) => (
                <div key={label}>
                  <div style={{ fontSize: 11.5, color: '#8b91a3', marginBottom: 4 }}>{label}</div>
                  <div style={{ font: '700 18px Sora,sans-serif' }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
