import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { blobToWavBase64 } from '../lib/audioToWav';

const optionBtn = { display: 'flex', alignItems: 'center', gap: 12, padding: 16, borderRadius: 14, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.04)', color: '#eef0f6', font: "600 14px 'IBM Plex Sans',sans-serif", cursor: 'pointer', textAlign: 'left' };
const INCIDENT_TYPES = [
  'Threat of violence', 'Physical assault', 'Verbal abuse or intimidation',
  'Social boycott or economic exclusion', 'Property or land dispute',
  'Sexual harassment or assault', 'Discrimination in public services', 'Other',
];

function formatSeconds(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function FileComplaint() {
  const [incidentType, setIncidentType] = useState(INCIDENT_TYPES[0]);
  const [narrative, setNarrative] = useState('');
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [micError, setMicError] = useState('');
  const [docFile, setDocFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => () => {
    // Cleanup on unmount: release the mic and the blob: URL, don't leave
    // either hanging around if the survivor navigates away mid-recording.
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (timerRef.current) clearInterval(timerRef.current);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startRecording = async () => {
    setMicError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setRecordSeconds(0);
      timerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    } catch {
      setMicError('Could not access your microphone. Check your browser permissions, or upload an audio file instead below.');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const discardRecording = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
  };

  const handleAudioUpload = (file) => {
    if (!file) return;
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(file);
    setAudioUrl(URL.createObjectURL(file));
  };

  // A survivor who only records/uploads audio and never types anything must
  // still be able to submit - the narrative field itself stays required
  // server-side (schema.prisma; not changing that here), so a voice-only
  // submission sends this fixed placeholder instead of forcing typing.
  // Real content still reaches staff: the audio itself is preserved and
  // voice-DSP-analyzed either way - this placeholder only stands in for the
  // required text field, it is not a substitute for a real transcript (see
  // speech_engine.py's honesty notes on why that's a separate, harder gap).
  const VOICE_ONLY_PLACEHOLDER = '[Voice message submitted - no typed narrative. See attached audio recording.]';

  const submit = async () => {
    const hasNarrative = narrative.trim().length > 0;
    if ((!hasNarrative && !audioBlob) || submitting) return;
    const narrativeToSend = hasNarrative ? narrative.trim() : VOICE_ONLY_PLACEHOLDER;
    setSubmitting(true);
    setError('');
    try {
      const { complaint, case: newCase, linkedToExistingCase } = await api.post('/api/complaints', {
        incidentType,
        narrative: narrativeToSend,
        channel: 'portal',
      });

      // Always run a real AI assessment on the narrative, not just when
      // audio is attached - a text-only complaint (the common case) was
      // previously filed but never analyzed at all, silently leaving staff
      // with no risk signal on the majority of intakes. Best-effort: the
      // complaint is already filed either way, and staff can re-run this
      // later from Real-Time Assessment if it fails. Whether the audio came
      // from live recording or a file upload, it's normalized to WAV first
      // (see audioToWav.js) - the backend's decoder doesn't support the
      // webm/opus browsers record in, or phone voice-memo formats like m4a.
      //
      // Both failure points below used to fail completely silently (bare
      // .catch(() => {})) - a real bug: a consent gate (428), a WAV
      // conversion failure, or any AI-service outage all looked identical
      // to "everything worked" from here, with no assessment/transcript
      // ever created and no way for the survivor or staff to know why one
      // never appeared. Still non-blocking (the complaint itself must not
      // fail because of this), but now logged and surfaced as a soft,
      // non-alarming notice rather than swallowed outright.
      let assessmentFailed = false;
      const audioBase64 = audioBlob
        ? await blobToWavBase64(audioBlob).catch((err) => {
            console.error('Voice message could not be converted to WAV for AI assessment:', err);
            assessmentFailed = true;
            return undefined;
          })
        : undefined;
      await api.post('/api/assessments', {
        victimId: complaint.victimId,
        complaintId: complaint.id,
        caseId: newCase?.id,
        narrative: narrativeToSend,
        audioBase64,
      }).catch((err) => {
        console.error('Automatic AI assessment failed for this complaint:', err);
        assessmentFailed = true;
      });

      if (docFile) {
        const form = new FormData();
        form.append('file', docFile);
        form.append('type', 'EVIDENCE_PHOTO');
        form.append('title', docFile.name);
        form.append('victimId', complaint.victimId);
        form.append('complaintId', complaint.id);
        await api.postForm('/api/documents', form).catch(() => {});
      }

      setResult({ ...complaint, linkedToExistingCase, assessmentFailed });
      setNarrative('');
      discardRecording();
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
        <div style={{ fontSize: 13, color: '#8b91a3', marginBottom: 8 }}>Tell us what happened, in your own words (optional if you record a voice message below)</div>
        <textarea
          value={narrative}
          onChange={(e) => setNarrative(e.target.value)}
          placeholder="Write here... this is kept confidential"
          style={{ width: '100%', minHeight: 110, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 12, color: '#eef0f6', padding: 14, fontSize: 14, fontFamily: 'inherit', resize: 'vertical' }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 13, color: '#8b91a3' }}>Prefer to speak instead of type? You can record a voice message.</div>

        {!audioUrl && !recording && (
          <div onClick={startRecording} style={{ ...optionBtn, cursor: 'pointer' }}>
            <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'oklch(0.65 0.14 200 / 0.25)', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>&#127908;</div>
            Record a Voice Message
          </div>
        )}

        {recording && (
          <div style={{ ...optionBtn, cursor: 'default', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'oklch(0.62 0.21 25)' }} className="tsa-pulse-dot" />
              Recording… {formatSeconds(recordSeconds)}
            </div>
            <button onClick={stopRecording} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'oklch(0.62 0.21 25)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Stop</button>
          </div>
        )}

        {audioUrl && !recording && (
          <div style={{ ...optionBtn, cursor: 'default', flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'oklch(0.72 0.15 145 / 0.25)', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>&#9989;</div>
              Voice message ready
            </div>
            <audio controls src={audioUrl} style={{ width: '100%', height: 36 }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={discardRecording} style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: '1px solid rgba(255,255,255,.15)', background: 'transparent', color: '#c4c8d4', fontSize: 12.5, cursor: 'pointer' }}>Remove</button>
              <button onClick={startRecording} style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: '1px solid rgba(255,255,255,.15)', background: 'transparent', color: '#c4c8d4', fontSize: 12.5, cursor: 'pointer' }}>Re-record</button>
            </div>
          </div>
        )}

        {micError && <div style={{ fontSize: 12, color: 'oklch(0.75 0.18 25)' }}>{micError}</div>}

        <label style={{ fontSize: 12.5, color: '#8b91a3', textDecoration: 'underline', cursor: 'pointer', alignSelf: 'flex-start' }}>
          or upload an audio file instead
          <input type="file" accept="audio/*" hidden onChange={(e) => handleAudioUpload(e.target.files?.[0] ?? null)} />
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
          {result.linkedToExistingCase
            ? `Your complaint (${result.code}) has been added to your existing open case, so your officer sees the full picture. A counsellor will reach out to you shortly. You are not alone.`
            : `Your complaint (${result.code}) has been received. A counsellor will reach out to you shortly. You are not alone.`}
          {result.assessmentFailed && (
            <div style={{ marginTop: 8, fontSize: 12, color: 'oklch(0.85 0.1 145 / 0.8)' }}>
              Your complaint is safely filed and will be reviewed by staff either way - the automatic AI risk analysis just couldn't complete right now and may be retried by staff.
            </div>
          )}
        </div>
      )}

      <button
        onClick={submit}
        disabled={(!narrative.trim() && !audioBlob) || submitting}
        style={{ padding: 16, borderRadius: 12, border: 'none', background: 'oklch(0.58 0.19 275)', color: '#fff', font: '700 15px Sora,sans-serif', cursor: 'pointer', opacity: (!narrative.trim() && !audioBlob) || submitting ? 0.6 : 1 }}
      >
        {submitting ? 'Submitting…' : 'Submit Complaint'}
      </button>
    </div>
  );
}
