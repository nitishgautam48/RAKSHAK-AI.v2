import { useCallback, useRef, useState } from 'react';
import { connectSocket, getSocket } from './socket';

// Must match ai-service/app/engines/streaming_transcription.py's SAMPLE_RATE
// exactly - that endpoint assumes every chunk it receives is already at
// this rate, it does not resample.
const TARGET_SAMPLE_RATE = 16000;

function floatTo16BitPCM(float32Array) {
  const out = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

// A simple block-averaging downsampler, not a properly anti-aliased
// resampler (no low-pass filter before decimating) - adequate for speech
// at the ratios involved here (typically 48000/44100 -> 16000), and
// consistent with this codebase's "real but not over-engineered" DSP
// elsewhere (see voice_engine.py's own disclosed heuristics). A resampling
// artifact here could only ever make the audio handed to Whisper slightly
// lower-fidelity, never wrong in a way that fabricates words.
function downsampleBuffer(buffer, inputSampleRate, targetSampleRate) {
  if (targetSampleRate === inputSampleRate) return buffer;
  const ratio = inputSampleRate / targetSampleRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

// Live (near-real-time, segmented) transcription over the app's existing
// authenticated Socket.IO connection - see server/src/services/
// socket.service.ts and ai-service/app/engines/streaming_transcription.py
// for what happens on the other end and exactly what "near-real-time"
// honestly means (segment-by-segment as pauses are detected, not literal
// word-by-word streaming - faster-whisper has no incremental decoding API).
//
// Requires STT_PROVIDER=whisper_local configured on the AI service - if
// it's not, the very first transcribe:event will be a {type: "error", ...}
// message, surfaced via the returned `error` value, same "flag, don't
// crash" degrade as every other real-model engine in this codebase.
export function useLiveTranscription() {
  const [isActive, setIsActive] = useState(false);
  const [segments, setSegments] = useState([]); // finalized segment texts, in order
  const [partialText, setPartialText] = useState('');
  const [error, setError] = useState('');

  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const sourceRef = useRef(null);
  const silentGainRef = useRef(null);
  const streamRef = useRef(null);
  const socketRef = useRef(null);
  const handlerRef = useRef(null);

  const stop = useCallback(() => {
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    silentGainRef.current?.disconnect();
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (socketRef.current && handlerRef.current) {
      socketRef.current.emit('transcribe:stop');
      socketRef.current.off('transcribe:event', handlerRef.current);
    }
    processorRef.current = null;
    sourceRef.current = null;
    silentGainRef.current = null;
    audioContextRef.current = null;
    streamRef.current = null;
    setIsActive(false);
  }, []);

  const start = useCallback(async (languageHint) => {
    setError('');
    setSegments([]);
    setPartialText('');

    const socket = connectSocket() || getSocket();
    if (!socket) {
      setError('Not connected - please sign in again.');
      return;
    }
    socketRef.current = socket;

    const handleEvent = (payload) => {
      if (payload.type === 'error') {
        setError(payload.message);
        return;
      }
      if (payload.type === 'partial') {
        setPartialText(payload.text);
      } else if (payload.type === 'final') {
        setSegments((prev) => [...prev, payload.text]);
        setPartialText('');
      }
    };
    handlerRef.current = handleEvent;
    socket.on('transcribe:event', handleEvent);

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError('Could not access your microphone. Check your browser permissions.');
      socket.off('transcribe:event', handleEvent);
      return;
    }
    streamRef.current = stream;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioContextClass();
    audioContextRef.current = audioContext;
    const source = audioContext.createMediaStreamSource(stream);
    sourceRef.current = source;

    // ScriptProcessorNode is deprecated in favor of AudioWorkletNode, but
    // used deliberately here: AudioWorkletNode requires shipping and
    // loading a separate worklet module file via audioContext.audioWorklet.
    // addModule(url), real build/deployment complexity this first version
    // intentionally avoids. Every browser this app already targets (see
    // FileComplaint.jsx's MediaRecorder usage) still supports
    // ScriptProcessorNode today - migrating to AudioWorkletNode is a real,
    // disclosed follow-up, not a currently-broken path.
    const bufferSize = 4096;
    const processor = audioContext.createScriptProcessor(bufferSize, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      const downsampled = downsampleBuffer(input, audioContext.sampleRate, TARGET_SAMPLE_RATE);
      const pcm16 = floatTo16BitPCM(downsampled);
      socket.emit('transcribe:audio', pcm16.buffer);
    };

    // A ScriptProcessorNode only reliably fires onaudioprocess once
    // connected all the way to the destination (a long-standing WebAudio
    // quirk) - routed through a zero-gain node first so the mic is never
    // actually played back out loud (which would otherwise cause audible
    // feedback/echo).
    const silentGain = audioContext.createGain();
    silentGain.gain.value = 0;
    silentGainRef.current = silentGain;
    source.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(audioContext.destination);

    socket.emit('transcribe:start', { languageHint });
    setIsActive(true);
  }, []);

  return { isActive, segments, partialText, error, start, stop };
}
