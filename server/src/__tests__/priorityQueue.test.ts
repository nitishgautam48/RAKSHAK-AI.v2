import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computePriority,
  AGING_CAP,
  AGING_TAU_HOURS,
  VULNERABILITY_CAP,
  VULNERABILITY_UNDER_12_BONUS,
  TREND_CAP,
  STATUTORY_INVESTIGATION_DAYS,
  STATUTORY_URGENCY_CAP,
  STATUTORY_BREACH_BASE_FRACTION,
  RETALIATION_CAP,
  RETALIATION_PER_RECONTACT,
  REVIEW_UNCERTAINTY_BONUS,
  type ComputePriorityInputs,
} from '../services/priorityQueue.service.js';

const NOW = new Date('2026-01-03T00:00:00Z');

// A "neutral" case: fresh complaint (no statutory pressure), no vulnerability
// data, no assessment history (no trend), no re-contacts, fully confident LOW
// read - isolates whichever single factor a test actually varies.
function neutralInputs(overrides: Partial<ComputePriorityInputs> = {}): ComputePriorityInputs {
  return {
    sviValue: 40,
    sviBand: 'LOW',
    sviConfidence: 100,
    lastActionAt: NOW,
    lastActionSummary: 'just filed',
    victimAge: null,
    previousSviValue: null,
    complaintFiledAt: NOW,
    linkedRecontactCount: 0,
    now: NOW,
    ...overrides,
  };
}

test('a freshly-actioned, otherwise-neutral case has zero bonuses, score equals raw SVI', () => {
  const p = computePriority(neutralInputs({ sviValue: 60 }));
  assert.equal(p.hoursWaiting, 0);
  assert.equal(p.agingBonus, 0);
  assert.equal(p.vulnerabilityBonus, 0);
  assert.equal(p.trendBonus, 0);
  assert.equal(p.statutoryUrgencyBonus, 0);
  assert.equal(p.retaliationBonus, 0);
  assert.equal(p.reviewUncertaintyBonus, 0);
  assert.equal(p.priorityScore, 60);
  assert.deepEqual(p.reasons, []);
});

test('aging bonus saturates toward the cap rather than growing unbounded', () => {
  const tenHoursAgo = new Date(NOW.getTime() - 10 * 60 * 60 * 1000);
  const p = computePriority(neutralInputs({ lastActionAt: tenHoursAgo }));
  const expected = AGING_CAP * (1 - Math.exp(-10 / AGING_TAU_HOURS));
  assert.equal(p.hoursWaiting, 10);
  assert.ok(Math.abs(p.agingBonus - expected) < 0.05);

  // Far beyond the tau - bonus must approach but never exceed the cap.
  const wayInThePast = new Date(NOW.getTime() - 500 * 60 * 60 * 1000);
  const capped = computePriority(neutralInputs({ lastActionAt: wayInThePast }));
  assert.ok(capped.agingBonus <= AGING_CAP);
  assert.ok(capped.agingBonus > AGING_CAP - 0.1);
});

test('aging bonus grows faster in the first day than a linear rate would, then flattens', () => {
  // A saturating curve should be further along relative to its cap after
  // one day than a naive linear-to-cap-at-30h rate would be - this is the
  // actual behavioral difference v2 introduces over v1's flat rate.
  const oneDayAgo = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(NOW.getTime() - 48 * 60 * 60 * 1000);
  const afterOneDay = computePriority(neutralInputs({ lastActionAt: oneDayAgo })).agingBonus;
  const afterTwoDays = computePriority(neutralInputs({ lastActionAt: twoDaysAgo })).agingBonus;
  // The marginal gain from day 1 to day 2 must be smaller than from hour 0 to day 1 (concave/saturating shape).
  const gainDay1 = afterOneDay;
  const gainDay2 = afterTwoDays - afterOneDay;
  assert.ok(gainDay2 < gainDay1, 'later hours should contribute less marginal bonus than earlier hours');
});

test('priority score never exceeds 100 even when every factor is maxed', () => {
  const longAgo = new Date(NOW.getTime() - 1000 * 60 * 60 * 1000);
  const longOverdue = new Date(NOW.getTime() - (STATUTORY_INVESTIGATION_DAYS + 100) * 24 * 60 * 60 * 1000);
  const p = computePriority(
    neutralInputs({
      sviValue: 100,
      sviBand: 'CRITICAL',
      sviConfidence: 0,
      lastActionAt: longAgo,
      victimAge: 5,
      previousSviValue: 0,
      complaintFiledAt: longOverdue,
      linkedRecontactCount: 10,
    }),
  );
  assert.equal(p.priorityScore, 100);
});

test('a stale MODERATE case can overtake a fresh low-HIGH case via aging+vulnerability alone, but never a fresh CRITICAL one', () => {
  const fortyHoursAgo = new Date(NOW.getTime() - 40 * 60 * 60 * 1000);
  const staleModerate = computePriority(neutralInputs({ sviValue: 40, lastActionAt: fortyHoursAgo, victimAge: 10 }));
  const freshHigh = computePriority(neutralInputs({ sviValue: 58 }));
  const freshCritical = computePriority(neutralInputs({ sviValue: 80 }));

  assert.ok(staleModerate.priorityScore > freshHigh.priorityScore, 'stale+vulnerable moderate should overtake a fresh low-HIGH case');
  assert.ok(staleModerate.priorityScore < freshCritical.priorityScore, 'tier-2 factors alone must never overtake a fresh CRITICAL case');
});

test('negative time (clock skew) never produces a negative aging bonus', () => {
  const future = new Date(NOW.getTime() + 60 * 60 * 1000);
  const p = computePriority(neutralInputs({ lastActionAt: future }));
  assert.equal(p.hoursWaiting, 0);
  assert.equal(p.agingBonus, 0);
});

test('vulnerability bonus is highest for young children, present but smaller for minors and the elderly, absent otherwise', () => {
  const child = computePriority(neutralInputs({ victimAge: 8 }));
  const minor = computePriority(neutralInputs({ victimAge: 15 }));
  const elderly = computePriority(neutralInputs({ victimAge: 70 }));
  const adult = computePriority(neutralInputs({ victimAge: 35 }));

  assert.equal(child.vulnerabilityBonus, VULNERABILITY_UNDER_12_BONUS);
  assert.ok(minor.vulnerabilityBonus > 0 && minor.vulnerabilityBonus < VULNERABILITY_UNDER_12_BONUS);
  assert.ok(elderly.vulnerabilityBonus > 0);
  assert.equal(adult.vulnerabilityBonus, 0);
  assert.ok(child.vulnerabilityBonus <= VULNERABILITY_CAP);
});

test('trend bonus rewards worsening distress across assessments but never penalizes improvement', () => {
  const worsening = computePriority(neutralInputs({ sviValue: 60, previousSviValue: 30 }));
  const improving = computePriority(neutralInputs({ sviValue: 30, previousSviValue: 60 }));
  const flat = computePriority(neutralInputs({ sviValue: 40, previousSviValue: 40 }));
  const noHistory = computePriority(neutralInputs({ sviValue: 40, previousSviValue: null }));

  assert.ok(worsening.trendBonus > 0);
  assert.ok(worsening.trendBonus <= TREND_CAP);
  assert.equal(improving.trendBonus, 0);
  assert.equal(flat.trendBonus, 0);
  assert.equal(noHistory.trendBonus, 0);
});

test('statutory urgency is zero well before the deadline, ramps as it approaches, and jumps once missed', () => {
  const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

  const freshlyFiled = computePriority(neutralInputs({ complaintFiledAt: NOW }));
  const halfway = computePriority(neutralInputs({ complaintFiledAt: daysAgo(STATUTORY_INVESTIGATION_DAYS / 2) }));
  const almostDue = computePriority(neutralInputs({ complaintFiledAt: daysAgo(STATUTORY_INVESTIGATION_DAYS - 2) }));
  const justMissed = computePriority(neutralInputs({ complaintFiledAt: daysAgo(STATUTORY_INVESTIGATION_DAYS + 1) }));
  const longMissed = computePriority(neutralInputs({ complaintFiledAt: daysAgo(STATUTORY_INVESTIGATION_DAYS + 200) }));

  assert.equal(freshlyFiled.statutoryUrgencyBonus, 0);
  assert.equal(halfway.statutoryUrgencyBonus, 0);
  assert.ok(almostDue.statutoryUrgencyBonus > 0 && almostDue.statutoryUrgencyBonus < STATUTORY_URGENCY_CAP * STATUTORY_BREACH_BASE_FRACTION);
  assert.ok(justMissed.statutoryUrgencyBonus >= STATUTORY_URGENCY_CAP * STATUTORY_BREACH_BASE_FRACTION);
  assert.ok(longMissed.statutoryUrgencyBonus <= STATUTORY_URGENCY_CAP);
  assert.ok(longMissed.statutoryUrgencyBonus >= justMissed.statutoryUrgencyBonus);
  assert.ok(justMissed.reasons.some((r) => r.includes('deadline missed')));
});

test('combined tier-3 signals can push a MODERATE case above a case just at the fresh-CRITICAL boundary - intentional (tier 3 is not bounded by tier 2\'s anti-inversion cap)', () => {
  // Deliberately not an unconditional override: each tier-3 factor is still
  // individually capped (statutory 25, retaliation 20), so this only holds
  // when multiple real compliance/safety signals stack, not from severity
  // alone being ignored - a moderate case with a merely-old deadline can't
  // beat an extremely severe fresh case, but one with BOTH a missed
  // deadline AND a confirmed re-contact pattern can beat one at the low end
  // of CRITICAL.
  const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
  const overdueAndRecontacted = computePriority(
    neutralInputs({ sviValue: 40, complaintFiledAt: daysAgo(STATUTORY_INVESTIGATION_DAYS + 50), linkedRecontactCount: 2 }),
  );
  const freshLowCritical = computePriority(neutralInputs({ sviValue: 75 }));
  assert.ok(overdueAndRecontacted.priorityScore > freshLowCritical.priorityScore);

  // But it still can't beat a much more severe fresh case - tier 3 closes a
  // real gap, it doesn't erase severity entirely.
  const freshVeryHighCritical = computePriority(neutralInputs({ sviValue: 95 }));
  assert.ok(overdueAndRecontacted.priorityScore < freshVeryHighCritical.priorityScore);
});

test('retaliation bonus scales with re-contact count and is capped', () => {
  const once = computePriority(neutralInputs({ linkedRecontactCount: 1 }));
  const twice = computePriority(neutralInputs({ linkedRecontactCount: 2 }));
  const many = computePriority(neutralInputs({ linkedRecontactCount: 50 }));

  assert.equal(once.retaliationBonus, RETALIATION_PER_RECONTACT);
  assert.equal(twice.retaliationBonus, RETALIATION_PER_RECONTACT * 2);
  assert.equal(many.retaliationBonus, RETALIATION_CAP);
  assert.ok(once.reasons.some((r) => r.includes('Re-contacted')));
});

test('review-uncertainty bonus only fires for low-confidence HIGH/CRITICAL reads, never for LOW/MODERATE', () => {
  const uncertainCritical = computePriority(neutralInputs({ sviBand: 'CRITICAL', sviConfidence: 40 }));
  const confidentCritical = computePriority(neutralInputs({ sviBand: 'CRITICAL', sviConfidence: 90 }));
  const uncertainLow = computePriority(neutralInputs({ sviBand: 'LOW', sviConfidence: 40 }));

  assert.equal(uncertainCritical.reviewUncertaintyBonus, REVIEW_UNCERTAINTY_BONUS);
  assert.equal(confidentCritical.reviewUncertaintyBonus, 0);
  assert.equal(uncertainLow.reviewUncertaintyBonus, 0);
});
