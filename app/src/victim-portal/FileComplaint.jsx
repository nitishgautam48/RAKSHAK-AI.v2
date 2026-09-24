import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { blobToWavBase64 } from '../lib/audioToWav';
import { useLiveTranscription } from '../lib/useLiveTranscription';

const optionBtn = { display: 'flex', alignItems: 'center', gap: 12, padding: 16, borderRadius: 14, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.04)', color: '#eef0f6', font: "600 14px 'IBM Plex Sans',sans-serif", cursor: 'pointer', textAlign: 'left' };
const INCIDENT_TYPES = [
  'Threat of violence', 'Physical assault', 'Verbal abuse or intimidation',
  'Social boycott or economic exclusion', 'Property or land dispute',
  'Sexual harassment or assault', 'Discrimination in public services', 'Other',
];

function formatElapsed(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function FileComplaint() {
  const [incidentType, setIncidentType] = useState(INCIDENT_TYPES[0]);
  const [narrative, setNarrative] = useState('');
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [docFile, setDocFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Live speech-to-text, same engine already proven on the gov-side
  // Real-Time Assessment page - replaces the old record-a-blob-then-
  // convert-to-WAV-on-submit flow. As the survivor speaks, Whisper
  // transcribes it a few words at a time and the real words land directly
  // in the narrative box, instead of a fixed placeholder being submitted
  // and only transcribed (if at all) later, invisibly, after the fact.
  const live = useLiveTranscription();
  const appendedSegmentCount = useRef(0);

  useEffect(() => {
    if (live.segments.length <= appendedSegmentCount.current) return;
    const newText = live.segments.slice(appendedSegmentCount.current).join(' ');
    appendedSegmentCount.current = live.segments.length;
    setNarrative((prev) => (prev.trim() ? `${prev.trim()} ${newText}` : newText));
  }, [live.segments]);

  useEffect(() => {
    if (!live.isActive) {
      setElapsedSeconds(0);
      return undefined;
    }
    const startedAt = Date.now();
    const id = setInterval(() => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(id);
  }, [live.isActive]);

  const startSpeaking = () => {
    appendedSegmentCount.current = 0;
    live.start();
  };

  // Release the mic if the survivor navigates away mid-session, rather
  // than leaving it open in the background - live.stop is a stable
  // useCallback ref, so this is deliberately mount/unmount-only.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => live.stop(), []);

  useEffect(() => () => {
    // Cleanup on unmount: don't leave an uploaded-file blob: URL hanging
    // around if the survivor navigates away.
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Live speaking fills the narrative box with real transcribed words as
  // the survivor talks (see the useLiveTranscription effect above), so this
  // placeholder now only covers the narrower case of an uploaded audio file
  // with no typed text and no live speech - the narrative field stays
  // required server-side (schema.prisma; not changing that here). Real
  // content still reaches staff either way: the audio itself is preserved
  // and voice-DSP-analyzed - this placeholder only stands in for the
  // required text field, it is not a substitute for a real transcript.
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
      // later from Real-Time Assessment if it fails. audioBlob here only
      // ever comes from an uploaded file now (live speech never produces
      // one - its words already landed directly in narrativeToSend above),
      // and still gets normalized to WAV first (see audioToWav.js) - the
      // backend's decoder doesn't support the webm/opus browsers record in,
      // or phone voice-memo formats like m4a.
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
      appendedSegmentCount.current = 0;
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
        <div style={{ fontSize: 13, color: '#8b91a3', marginBottom: 8 }}>Tell us what happened, in your own words (or speak instead, using the button below)</div>
        <textarea
          value={narrative}
          onChange={(e) => setNarrative(e.target.value)}
          placeholder="Write here... this is kept confidential"
          style={{ width: '100%', minHeight: 110, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 12, color: '#eef0f6', padding: 14, fontSize: 14, fontFamily: 'inherit', resize: 'vertical' }}
        />
        {live.isActive && live.partialText && (
          <div style={{ marginTop: 6, fontSize: 12.5, color: '#8b91a3', fontStyle: 'italic' }}>
            {live.partialText}
            <span className="tsa-pulse-dot" style={{ display: 'inline-block', width: 7, height: 12, background: 'oklch(0.65 0.14 200)', marginLeft: 4, verticalAlign: 'middle' }} />
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 13, color: '#8b91a3' }}>Prefer to speak instead of type? Your words appear above as you talk.</div>

        {!live.isActive && (
          <div onClick={startSpeaking} style={{ ...optionBtn, cursor: 'pointer' }}>
            <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'oklch(0.65 0.14 200 / 0.25)', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>&#127908;</div>
            Speak Instead of Typing
          </div>
        )}

        {live.isActive && (
          <div style={{ ...optionBtn, cursor: 'default', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'oklch(0.62 0.21 25)' }} className="tsa-pulse-dot" />
              Listening… {formatElapsed(elapsedSeconds)}
            </div>
            <button onClick={live.stop} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'oklch(0.62 0.21 25)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Stop</button>
          </div>
        )}

        {live.error && <div style={{ fontSize: 12, color: 'oklch(0.75 0.18 25)' }}>{live.error}</div>}

        <div style={{ fontSize: 11.5, color: '#5c6178' }}>
          Words are transcribed as you speak and never leave this device as raw audio for that purpose - only the text is used. Prefer to send the recording itself too? You still can:
        </div>

        {!audioUrl ? (
          <label style={{ fontSize: 12.5, color: '#8b91a3', textDecoration: 'underline', cursor: 'pointer', alignSelf: 'flex-start' }}>
            attach an audio file
            <input type="file" accept="audio/*" hidden onChange={(e) => handleAudioUpload(e.target.files?.[0] ?? null)} />
          </label>
        ) : (
          <div style={{ ...optionBtn, cursor: 'default', flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'oklch(0.72 0.15 145 / 0.25)', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>&#9989;</div>
              Audio file attached
            </div>
            <audio controls src={audioUrl} style={{ width: '100%', height: 36 }} />
            <button onClick={discardRecording} style={{ padding: '8px 0', borderRadius: 8, border: '1px solid rgba(255,255,255,.15)', background: 'transparent', color: '#c4c8d4', fontSize: 12.5, cursor: 'pointer' }}>Remove</button>
          </div>
        )}

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
