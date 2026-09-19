import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateEscalationTriggers,
  PRIORITY_THRESHOLD,
  STALE_HOURS_THRESHOLD,
} from '../services/autoEscalation.service.js';

test('no triggers fire for a fresh, low-priority case', () => {
  const triggers = evaluateEscalationTriggers(40, 2);
  assert.equal(triggers.length, 0);
});

test('priority_threshold fires exactly at the threshold, not just above it', () => {
  const below = evaluateEscalationTriggers(PRIORITY_THRESHOLD - 0.1, 0);
  const at = evaluateEscalationTriggers(PRIORITY_THRESHOLD, 0);
  assert.equal(below.some((t) => t.reason === 'priority_threshold'), false);
  assert.equal(at.some((t) => t.reason === 'priority_threshold'), true);
});

test('stale_unactioned fires exactly at the threshold, not just above it', () => {
  const below = evaluateEscalationTriggers(0, STALE_HOURS_THRESHOLD - 0.1);
  const at = evaluateEscalationTriggers(0, STALE_HOURS_THRESHOLD);
  assert.equal(below.some((t) => t.reason === 'stale_unactioned'), false);
  assert.equal(at.some((t) => t.reason === 'stale_unactioned'), true);
});

test('both triggers can fire together for a high-priority, long-stale case', () => {
  const triggers = evaluateEscalationTriggers(90, 100);
  const reasons = triggers.map((t) => t.reason).sort();
  assert.deepEqual(reasons, ['priority_threshold', 'stale_unactioned']);
});

test('trigger messages cite the actual numbers, not a generic message', () => {
  const triggers = evaluateEscalationTriggers(82.3, 10);
  assert.match(triggers[0].message, /82\.3/);
});
