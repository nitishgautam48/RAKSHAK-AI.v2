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

test('a missed statutory deadline fires its own distinct trigger, independent of priority_threshold', () => {
  // Below the priority_threshold on severity alone, but the statutory
  // urgency bonus (passed straight from priorityQueue.service.ts's
  // breakdown) indicates a missed deadline - a real compliance failure a
  // human should know about regardless of how the case reads emotionally.
  const triggers = evaluateEscalationTriggers(40, 0, 22, 0);
  assert.ok(triggers.some((t) => t.reason === 'statutory_deadline_breach'));
  assert.ok(!triggers.some((t) => t.reason === 'priority_threshold'));
});

test('statutory trigger does not fire while urgency is only ramping toward the deadline, not yet breached', () => {
  const triggers = evaluateEscalationTriggers(40, 0, 5, 0);
  assert.ok(!triggers.some((t) => t.reason === 'statutory_deadline_breach'));
});

test('a single real re-contact fires the repeat-contact trigger', () => {
  const triggers = evaluateEscalationTriggers(40, 0, 0, 10);
  assert.ok(triggers.some((t) => t.reason === 'repeat_contact_pattern'));
});

test('zero re-contacts does not fire the repeat-contact trigger', () => {
  const triggers = evaluateEscalationTriggers(40, 0, 0, 0);
  assert.ok(!triggers.some((t) => t.reason === 'repeat_contact_pattern'));
});
