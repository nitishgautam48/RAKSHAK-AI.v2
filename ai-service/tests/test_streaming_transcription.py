from app.engines.streaming_transcription import (
    BYTES_PER_SAMPLE,
    MAX_SEGMENT_DURATION_S,
    MIN_SEGMENT_AUDIO_S,
    PARTIAL_INTERVAL_S,
    SAMPLE_RATE,
    SILENCE_DURATION_TO_FINALIZE_S,
    StreamingSegmenter,
    rms,
)


class FakeClock:
    def __init__(self):
        self.now = 0.0

    def advance(self, seconds: float) -> float:
        self.now += seconds
        return self.now

    def __call__(self) -> float:
        return self.now


def loud_chunk(seconds: float) -> bytes:
    # A simple, real (not fabricated) loud alternating-sample PCM chunk -
    # well above SILENCE_RMS_THRESHOLD, of exactly the requested duration.
    n_samples = int(SAMPLE_RATE * seconds)
    pattern = bytes([0x00, 0x7F, 0x00, 0x80]) * (n_samples // 2 + 1)
    return pattern[: n_samples * BYTES_PER_SAMPLE]


def silent_chunk(seconds: float) -> bytes:
    n_samples = int(SAMPLE_RATE * seconds)
    return b"\x00\x00" * n_samples


def test_rms_of_silence_is_zero():
    assert rms(silent_chunk(1.0)) == 0.0


def test_rms_of_loud_audio_is_well_above_silence_threshold():
    from app.engines.streaming_transcription import SILENCE_RMS_THRESHOLD

    assert rms(loud_chunk(0.5)) > SILENCE_RMS_THRESHOLD


def test_no_transcription_below_minimum_segment_duration():
    clock = FakeClock()
    calls = []

    def fake_transcribe(pcm, lang):
        calls.append(pcm)
        return "should not be called"

    segmenter = StreamingSegmenter(fake_transcribe, now_fn=clock)
    tiny_chunk = loud_chunk(MIN_SEGMENT_AUDIO_S / 2)
    events = segmenter.push_audio(tiny_chunk)
    assert events == []
    assert calls == []


def test_partial_fires_after_interval_with_enough_audio():
    clock = FakeClock()
    calls = []

    def fake_transcribe(pcm, lang):
        calls.append(len(pcm))
        return "hello there"

    segmenter = StreamingSegmenter(fake_transcribe, now_fn=clock)
    # Enough audio buffered, but not enough time elapsed yet for a partial.
    segmenter.push_audio(loud_chunk(1.0))
    clock.advance(0.5)
    events = segmenter.push_audio(loud_chunk(0.5))
    assert events == []
    assert calls == []

    # Now cross PARTIAL_INTERVAL_S.
    clock.advance(PARTIAL_INTERVAL_S)
    events = segmenter.push_audio(loud_chunk(0.5))
    assert len(events) == 1
    assert events[0].type == "partial"
    assert events[0].text == "hello there"
    assert events[0].segment_index == 0
    assert len(calls) == 1


def test_silence_after_speech_finalizes_the_segment():
    clock = FakeClock()

    def fake_transcribe(pcm, lang):
        return "she said they threatened her"

    segmenter = StreamingSegmenter(fake_transcribe, now_fn=clock)
    segmenter.push_audio(loud_chunk(1.0))
    clock.advance(0.1)

    # Silence starts accumulating but hasn't crossed the finalize threshold yet.
    events = segmenter.push_audio(silent_chunk(0.3))
    assert events == []

    clock.advance(SILENCE_DURATION_TO_FINALIZE_S)
    events = segmenter.push_audio(silent_chunk(0.1))
    assert len(events) == 1
    assert events[0].type == "final"
    assert events[0].segment_index == 0


def test_finalizing_resets_state_for_the_next_segment():
    clock = FakeClock()
    segment_indices_seen = []

    def fake_transcribe(pcm, lang):
        return "some words"

    segmenter = StreamingSegmenter(fake_transcribe, now_fn=clock)

    # First segment: speak, then pause (two silent pushes - the silence
    # timer starts on the first one and must be sustained past the second)
    # to finalize.
    segmenter.push_audio(loud_chunk(1.0))
    clock.advance(0.1)
    segmenter.push_audio(silent_chunk(0.1))  # starts the silence timer
    clock.advance(SILENCE_DURATION_TO_FINALIZE_S + 0.1)
    events = segmenter.push_audio(silent_chunk(0.1))  # crosses the threshold
    segment_indices_seen.append(events[0].segment_index)

    # Second segment starts fresh at index 1, not still accumulating from before.
    clock.advance(0.1)
    segmenter.push_audio(loud_chunk(1.0))
    clock.advance(0.1)
    segmenter.push_audio(silent_chunk(0.1))
    clock.advance(SILENCE_DURATION_TO_FINALIZE_S + 0.1)
    events = segmenter.push_audio(silent_chunk(0.1))
    segment_indices_seen.append(events[0].segment_index)

    assert segment_indices_seen == [0, 1]


def test_max_duration_forces_a_final_even_with_continuous_speech():
    clock = FakeClock()

    def fake_transcribe(pcm, lang):
        return "a very long uninterrupted sentence with no pauses at all"

    segmenter = StreamingSegmenter(fake_transcribe, now_fn=clock)
    saw_final = False
    # Push loud audio in small steps past MAX_SEGMENT_DURATION_S without any silence.
    elapsed = 0.0
    while elapsed < MAX_SEGMENT_DURATION_S + 1.0:
        events = segmenter.push_audio(loud_chunk(0.5))
        clock.advance(0.5)
        elapsed += 0.5
        if any(e.type == "final" for e in events):
            saw_final = True
            break
    assert saw_final


def test_empty_transcription_result_produces_no_event():
    clock = FakeClock()

    def fake_transcribe(pcm, lang):
        return "   "  # e.g. Whisper hearing pure noise and returning nothing meaningful

    segmenter = StreamingSegmenter(fake_transcribe, now_fn=clock)
    segmenter.push_audio(loud_chunk(1.0))
    clock.advance(PARTIAL_INTERVAL_S)
    events = segmenter.push_audio(loud_chunk(0.1))
    assert events == []


def test_flush_with_empty_buffer_returns_none():
    segmenter = StreamingSegmenter(lambda pcm, lang: "x")
    assert segmenter.flush() is None


def test_flush_finalizes_a_pending_segment_mid_sentence():
    clock = FakeClock()

    def fake_transcribe(pcm, lang):
        return "cut off mid"

    segmenter = StreamingSegmenter(fake_transcribe, now_fn=clock)
    segmenter.push_audio(loud_chunk(1.0))  # no silence, no pause - stream just ends here
    event = segmenter.flush()
    assert event is not None
    assert event.type == "final"
    assert event.text == "cut off mid"


def test_language_hint_is_passed_through_to_transcribe_fn():
    received = {}

    def fake_transcribe(pcm, lang):
        received["lang"] = lang
        return "bonjour"

    clock = FakeClock()
    segmenter = StreamingSegmenter(fake_transcribe, language_hint="hi", now_fn=clock)
    segmenter.push_audio(loud_chunk(1.0))
    clock.advance(PARTIAL_INTERVAL_S)
    segmenter.push_audio(loud_chunk(0.1))
    assert received["lang"] == "hi"
