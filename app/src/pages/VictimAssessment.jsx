import { psychColor } from '../data/constants';
import { useAssessmentSelector } from '../lib/useAssessmentSelector';
import ComplaintSelector from '../components/ComplaintSelector';

const card = { background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 14, padding: 22 };

export default function VictimAssessment() {
  const { complaints, selectedId, setSelectedId, complaint, assessment, engineOutputs, loading } = useAssessmentSelector();

  const psychScores = assessment ? [
    { label: 'Stress Vulnerability (SVI)', value: Math.round(assessment.sviScore?.value ?? 0) },
    { label: 'Trauma Score', value: Math.round(assessment.traumaScore?.score ?? 0) },
    { label: 'Fear Score', value: Math.round(assessment.fearScore?.score ?? 0) },
    { label: 'Anxiety (from Emotion Engine)', value: Math.round(assessment.emotionScore?.anxiety ?? 0) },
    { label: 'Hopelessness (from NLP Engine)', value: Math.round(engineOutputs.nlp?.hopelessnessScore ?? 0) },
    { label: 'Isolation Score', value: Math.round(assessment.isolationScore?.score ?? 0) },
  ] : [];

  return (
    <div className="tsa-fade">
      <ComplaintSelector complaints={complaints} selectedId={selectedId} onChange={setSelectedId} />
      {loading && <div style={{ color: '#7d8399', fontSize: 13 }}>Loading…</div>}
      {!loading && complaint && (
        <div style={{ display: 'grid', gridTemplateColumns: '.9fr 1.1fr', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={card}>
              <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 16 }}>Victim Profile</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
                {[
                  ['Complaint Code', complaint.code],
                  ['Case ID', complaint.victim.displayCode],
                  ['Gender', complaint.victim.gender ?? 'Not specified'],
                  ['Age', complaint.victim.age ?? 'Not specified'],
                  ['District', complaint.district],
                  ['State', complaint.state],
                  ['Language', complaint.victim.language],
                ].map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,.05)', paddingBottom: 8 }}>
                    <div style={{ color: '#7d8399' }}>{label}</div><div>{value}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={card}>
              <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 14 }}>Incident Details</div>
              <div style={{ fontSize: 12.5, color: '#8b91a3', marginBottom: 10 }}>Type: <span style={{ color: '#eef0f6' }}>{complaint.incidentType}</span> &middot; Filed {new Date(complaint.createdAt).toLocaleDateString()}</div>
              <div style={{ fontSize: 13, lineHeight: 1.6, color: '#c4c8d4' }}>{complaint.narrative}</div>
            </div>
          </div>
          <div style={card}>
            <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 6 }}>Psychological Assessment</div>
            {assessment ? (
              <>
                <div style={{ fontSize: 11, color: '#5c6178', marginBottom: 16 }}>From the most recent AI assessment, run {new Date(assessment.createdAt).toLocaleString()}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {psychScores.map((ps) => {
                    const color = psychColor(ps.value);
                    return (
                      <div key={ps.label}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 6 }}>
                          <div style={{ color: '#c4c8d4' }}>{ps.label}</div><div style={{ fontWeight: 600, color }}>{ps.value}/100</div>
                        </div>
                        <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,.06)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', borderRadius: 4, background: color, width: `${ps.value}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12.5, color: '#5c6178', marginTop: 12 }}>
                No AI assessment has been run for this complaint yet. Submit one from Real-Time Assessment.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
