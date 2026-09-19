// A single source of truth for what a transcript's source ACTUALLY means -
// staff previously had no clear way to tell a real machine transcription of
// audio apart from the operator/victim's own typed text, which matters a
// lot once real speech-to-text (whisper_local) is enabled: for a voice-only
// complaint, the "narrative" on file is just a placeholder, and the AI
// scores are computed from this transcript instead - the badge is the only
// visible signal of which one staff are actually looking at.
const SOURCE_META = {
  whisper_local: {
    label: 'Real transcript (Whisper)',
    icon: '\u{1F3A4}', // microphone
    color: 'oklch(0.72 0.15 145)',
    bg: 'oklch(0.72 0.15 145 / 0.12)',
    title: 'Machine-transcribed from the actual submitted audio.',
  },
  operator_transcript: {
    label: 'Typed narrative',
    icon: '⌨', // keyboard
    color: 'oklch(0.75 0.13 200)',
    bg: 'oklch(0.75 0.13 200 / 0.12)',
    title: 'Entered directly by the operator or survivor - not a machine transcription of any attached audio.',
  },
};

export default function TranscriptSourceBadge({ source, hasAudio }) {
  const meta = SOURCE_META[source] ?? SOURCE_META.operator_transcript;
  // Audio was attached but nothing about it was actually transcribed - the
  // single most important state to flag, since it looks superficially like
  // "no audio was ever submitted" otherwise.
  const isUntranscribedAudio = hasAudio && source !== 'whisper_local';

  return (
    <span
      title={isUntranscribedAudio ? 'Audio was attached to this complaint, but was not machine-transcribed - real speech-to-text is not enabled for this deployment. This text is the typed narrative, not the audio content.' : meta.title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 9px', borderRadius: 20,
        fontSize: 10.5, fontWeight: 600, color: isUntranscribedAudio ? 'oklch(0.75 0.15 55)' : meta.color,
        background: isUntranscribedAudio ? 'oklch(0.75 0.15 55 / 0.12)' : meta.bg,
      }}
    >
      {isUntranscribedAudio ? '⚠' : meta.icon} {isUntranscribedAudio ? 'Audio attached, not transcribed' : meta.label}
    </span>
  );
}
