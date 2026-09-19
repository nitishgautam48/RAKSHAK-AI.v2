import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePriority, AGING_RATE_PER_HOUR, AGING_CAP } from '../services/priorityQueue.service.js';

test('a freshly-actioned case has zero aging bonus, score equals raw SVI', () => {
  const now = new Date('2026-01-01T12:00:00Z');
  const p = computePriority(60, now, 'just filed', now);
  assert.equal(p.hoursWaiting, 0);
  assert.equal(p.agingBonus, 0);
  assert.equal(p.priorityScore, 60);
});

test('aging bonus accrues linearly up to the cap, then stops', () => {
  const now = new Date('2026-01-02T00:00:00Z');
  const tenHoursAgo = new Date(now.getTime() - 10 * 60 * 60 * 1000);
  const p = computePriority(40, tenHoursAgo, 'waiting', now);
  assert.equal(p.hoursWaiting, 10);
  assert.equal(p.agingBonus, 10 * AGING_RATE_PER_HOUR);
  assert.equal(p.priorityScore, 40 + 10 * AGING_RATE_PER_HOUR);

  // Far beyond the hours needed to hit the cap - bonus must not exceed it.
  const wayInThePast = new Date(now.getTime() - 500 * 60 * 60 * 1000);
  const capped = computePriority(40, wayInThePast, 'waiting a long time', now);
  assert.equal(capped.agingBonus, AGING_CAP);
  assert.equal(capped.priorityScore, 40 + AGING_CAP);
});

test('priority score never exceeds 100 even at max SVI plus full aging', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const longAgo = new Date(now.getTime() - 1000 * 60 * 60 * 1000);
  const p = computePriority(100, longAgo, 'critical and old', now);
  assert.equal(p.priorityScore, 100);
});

test('a stale MODERATE case can overtake a fresh low-HIGH case, but never a fresh CRITICAL one via aging alone', () => {
  const now = new Date('2026-01-03T00:00:00Z');
  // Worked example matching the module's own documented claim.
  const fortyHoursAgo = new Date(now.getTime() - 40 * 60 * 60 * 1000);
  const staleModerate = computePriority(40, fortyHoursAgo, 'moderate, long ignored', now);
  const freshHigh = computePriority(58, now, 'high, just filed', now);
  const freshCritical = computePriority(80, now, 'critical, just filed', now);

  assert.ok(staleModerate.priorityScore > freshHigh.priorityScore, 'stale moderate should overtake a fresh low-HIGH case');
  assert.ok(staleModerate.priorityScore < freshCritical.priorityScore, 'stale moderate must never overtake a fresh CRITICAL case');
});

test('negative time (clock skew) never produces a negative aging bonus', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const future = new Date(now.getTime() + 60 * 60 * 1000);
  const p = computePriority(50, future, 'somehow in the future', now);
  assert.equal(p.hoursWaiting, 0);
  assert.equal(p.agingBonus, 0);
});
