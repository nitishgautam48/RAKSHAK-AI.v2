import { useState } from 'react';
import { api } from '../lib/api';

const optionBtn = { display: 'flex', alignItems: 'center', gap: 12, padding: 16, borderRadius: 14, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.04)', color: '#eef0f6', font: "600 14px 'IBM Plex Sans',sans-serif", cursor: 'pointer', textAlign: 'left' };
const INCIDENT_TYPES = [
  'Threat of violence', 'Physical assault', 'Verbal abuse or intimidation',
  'Social boycott or economic exclusion', 'Property or land dispute',
  'Sexual harassment or assault', 'Discrimination in public services', 'Other',
];

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.slice(reader.result.indexOf(',') + 1));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function FileComplaint() {
  const [incidentType, setIncidentType] = useState(INCIDENT_TYPES[0]);
  const [narrative, setNarrative] = useState('');
  const [audioFile, setAudioFile] = useState(null);
  const [docFile, setDocFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const submit = async () => {
    if (!narrative.trim() || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const { complaint } = await api.post('/api/complaints', {
        incidentType,
        narrative: narrative.trim(),
        channel: 'portal',
      });

      if (audioFile) {
        const audioBase64 = await fileToBase64(audioFile);
        await api.post('/api/assessments', {
          victimId: complaint.victimId,
          complaintId: complaint.id,
          narrative: narrative.trim(),
          audioBase64,
        }).catch(() => {}); // complaint is already filed either way; assessment can also be run later by staff
      }

      if (docFile) {
        const form = new FormData();
        form.append('file', docFile);
        form.append('type', 'EVIDENCE_PHOTO');
        form.append('title', docFile.name);
        form.append('victimId', complaint.victimId);
        form.append('complaintId', complaint.id);
        await api.postForm('/api/documents', form).catch(() => {});
      }

      setResult(complaint);
      setNarrative('');
      setAudioFile(null);
      setDocFile(null);
    } catch (err) {
      setError(err.body?.message || 'Could not submit your complaint. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="tsa-fade" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ font: '700 20px Sora,sans-serif', marginBottom: 4 }}>File a Complaint</div>
        <div style={{ fontSize: 13.5, color: '#8b91a3' }}>Share as much or as little as feels safe. You can add more later.</div>
      </div>

      <div>
        <div style={{ fontSize: 13, color: '#8b91a3', marginBottom: 8 }}>What kind of incident is this?</div>
        <select
          value={incidentType}
          onChange={(e) => setIncidentType(e.target.value)}
          style={{ width: '100%', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)', color: '#eef0f6', padding: 12, borderRadius: 10, fontSize: 14 }}
        >
          {INCIDENT_TYPES.map((t) => <option key={t} value={t} style={{ background: '#171a24' }}>{t}</option>)}
        </select>
      </div>

      <div>
        <div style={{ fontSize: 13, color: '#8b91a3', marginBottom: 8 }}>Tell us what happened, in your own words</div>
        <textarea
          value={narrative}
          onChange={(e) => setNarrative(e.target.value)}
          placeholder="Write here... this is kept confidential"
          style={{ width: '100%', minHeight: 110, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 12, color: '#eef0f6', padding: 14, fontSize: 14, fontFamily: 'inherit', resize: 'vertical' }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label style={{ ...optionBtn, cursor: 'pointer' }}>
          <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'oklch(0.65 0.14 200 / 0.25)', flex: 'none' }} />
          {audioFile ? `Audio attached: ${audioFile.name}` : 'Attach an Audio Recording'}
          <input type="file" accept="audio/*" hidden onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)} />
        </label>
        <label style={{ ...optionBtn, cursor: 'pointer' }}>
          <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'oklch(0.72 0.15 145 / 0.25)', flex: 'none' }} />
          {docFile ? `File attached: ${docFile.name}` : 'Upload a Document or Photo'}
          <input type="file" accept="image/*,.pdf,.doc,.docx" hidden onChange={(e) => setDocFile(e.target.files?.[0] ?? null)} />
        </label>
      </div>

      {error && (
        <div style={{ padding: 14, borderRadius: 12, background: 'oklch(0.62 0.21 25 / 0.12)', border: '1px solid oklch(0.62 0.21 25 / 0.35)', color: 'oklch(0.75 0.18 25)', fontSize: 13.5 }}>
          {error}
        </div>
      )}

      {result && (
        <div style={{ padding: 14, borderRadius: 12, background: 'oklch(0.72 0.15 145 / 0.12)', border: '1px solid oklch(0.72 0.15 145 / 0.35)', color: 'oklch(0.8 0.13 145)', fontSize: 13.5 }}>
          Your complaint ({result.code}) has been received. A counsellor will reach out to you shortly. You are not alone.
        </div>
      )}

      <button
        onClick={submit}
        disabled={!narrative.trim() || submitting}
        style={{ padding: 16, borderRadius: 12, border: 'none', background: 'oklch(0.58 0.19 275)', color: '#fff', font: '700 15px Sora,sans-serif', cursor: 'pointer', opacity: !narrative.trim() || submitting ? 0.6 : 1 }}
      >
        {submitting ? 'Submitting…' : 'Submit Complaint'}
      </button>
    </div>
  );
}
