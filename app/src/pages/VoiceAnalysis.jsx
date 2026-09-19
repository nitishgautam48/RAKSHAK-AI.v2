import { useAssessmentSelector } from '../lib/useAssessmentSelector';
import ComplaintSelector from '../components/ComplaintSelector';
import TranscriptSourceBadge from '../components/TranscriptSourceBadge';

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

      {!loading && !voiceRecording && (
        <div style={{ ...card, textAlign: 'center', padding: 40, color: '#7d8399' }}>
          {assessment ? (
            <>No audio was attached to this complaint's most recent assessment, so there is no voice signal to analyze. Attach an audio file from Real-Time Assessment to see real pitch/energy/pause DSP output here.</>
          ) : (
            <>No AI assessment has been run for this complaint yet.</>
          )}
        </div>
      )}

      {!loading && voiceRecording && !voice && (
        <div style={{ ...card, textAlign: 'center', padding: 40, color: '#7d8399', marginBottom: 16 }}>
          Audio was attached to this assessment, but voice-stress DSP (pitch/energy/pause analysis) could not be run on it -
          the audio format or content wasn't usable for that. {voiceRecording.transcript ? 'A transcript is still available below.' : 'No transcript is available either.'}
        </div>
      )}

      {!loading && voiceRecording && (voiceRecording.transcript || voice) && (
        <div style={{ display: 'grid', gridTemplateColumns: voice ? '1fr 1fr' : '1fr', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {voice && (
              <div style={card}>
                <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 14 }}>Energy Contour (real DSP output)</div>
                <svg viewBox="0 0 300 80" style={{ width: '100%', height: 80 }}>
                  <polyline points={toPoints(voice.energyContour, 300, 80)} fill="none" stroke="oklch(0.65 0.14 200)" strokeWidth="2" />
                </svg>
                <div style={{ fontSize: 12, color: '#7d8399', marginTop: 10 }}>
                  Language: <span style={{ color: '#eef0f6' }}>{voiceRecording?.languageCode ?? 'Unknown'}</span>
                </div>
              </div>
            )}
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ font: '600 14px Sora,sans-serif' }}>Transcript</div>
                <TranscriptSourceBadge source={voiceRecording?.transcriptSrc} hasAudio={!!voiceRecording} />
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: '#c4c8d4' }}>
                {voiceRecording?.transcript || <span style={{ color: '#5c6178' }}>No transcript text available.</span>}
              </div>
            </div>
          </div>
          {voice && <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
          </div>}
        </div>
      )}
    </div>
  );
}
