import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveAnalyzedText } from '../services/assessment.service.js';

// Regression guard for a real bug: before this, Assessment.sourceText (and
// therefore what the NLP Analysis page displays next to its scores) was
// always the client-submitted narrative - even for a voice-only complaint,
// where that's just the VOICE_ONLY_PLACEHOLDER text and every AI engine
// actually analyzed the real Whisper transcript instead (see task #119's
// main.py analysis_text). That left staff looking at placeholder text next
// to scores that had nothing to do with it.

test('a real whisper transcript is used as the analyzed text, not the placeholder narrative', () => {
  const ai = { transcript: { transcript: 'They threatened to kill us and burn our house.', source: 'whisper_local' } };
  const result = deriveAnalyzedText(ai, '[Voice message submitted - no typed narrative. See attached audio recording.]');
  assert.equal(result, 'They threatened to kill us and burn our house.');
});

test('a typed narrative is used as-is when there is no real transcript', () => {
  const ai = { transcript: { transcript: 'They threatened to kill us and burn our house.', source: 'operator_transcript' } };
  const result = deriveAnalyzedText(ai, 'They threatened to kill us and burn our house.');
  assert.equal(result, 'They threatened to kill us and burn our house.');
});

test('an empty whisper transcript falls back to the submitted narrative rather than persisting blank text', () => {
  const ai = { transcript: { transcript: '   ', source: 'whisper_local' } };
  const result = deriveAnalyzedText(ai, 'Fallback narrative text.');
  assert.equal(result, 'Fallback narrative text.');
});

// Regression guard for the generalization from an exact 'whisper_local'
// match to "any source other than operator_transcript" - added alongside
// the indic_conformer ASR provider (ai-service/app/engines/speech_engine.py)
// so a second real ASR provider didn't need a second hand-maintained check.
test('a real indic_conformer transcript is used as the analyzed text too, not just whisper_local', () => {
  const ai = { transcript: { transcript: 'mujhe madad chahiye, unhone dhamki di', source: 'indic_conformer' } };
  const result = deriveAnalyzedText(ai, '[Voice message submitted - no typed narrative. See attached audio recording.]');
  assert.equal(result, 'mujhe madad chahiye, unhone dhamki di');
});
