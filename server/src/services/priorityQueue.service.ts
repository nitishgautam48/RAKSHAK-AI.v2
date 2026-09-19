import type { PrismaClient } from '@prisma/client';

// Real staff-facing case ranking (v2).
//
// v1 had exactly one lever besides raw severity: generic time-waited. Real
// triage in an SC/ST-atrocities context has several distinct signals v1
// couldn't see at all - a legally mandated deadline about to be missed, a
// victim who reported once and is now being re-contacted (a retaliation/
// re-victimization signal), distress that's trending worse across repeat
// assessments, and cases where the model's own confidence is too low to
// trust blindly. v2 adds all four without dropping v1's core invariant.
//
//   priorityScore = min(100, sviValue + tier2Total + tier3Total)
//
// TIER 1 (unchanged): sviValue, the case's most recent SVI (0-100). Already
// bakes in the suicidal-ideation floor and authority-escalation weighting
// from ai-service/app/engines/svi_engine.py - deliberately not re-applied
// here, to avoid double-counting.
//
// TIER 2: bounded "waiting" modifiers, individually capped so their SUM
// preserves v1's anti-inversion invariant - a merely-neglected/vulnerable
// case must never be able to fully leapfrog a freshly-filed CRITICAL one on
// these alone:
//   - agingBonus (cap 15): now a saturating curve, not linear-then-hard-cap
//     - grows quickly in the first day, then flattens, instead of v1's
//     constant per-hour rate with an abrupt stop at the cap.
//   - vulnerabilityBonus (cap 8): uses the Victim's actual recorded age
//     (already in the schema, no migration needed) as ground truth, rather
//     than only inferring "child"/"elderly" from whether the narrative
//     happens to use those words.
//   - trendBonus (cap 7): compares the case's two most recent SVI values;
//     distress that's getting WORSE across assessments earns a small bonus
//     even before it peaks. A stable or improving trend earns nothing (never
//     a penalty - this system only ever adds signal, never subtracts it).
//
// TIER 3: override-class escalation signals, deliberately NOT constrained
// by the tier-2 cap, because each represents an active compliance failure
// or an ongoing threat pattern rather than accumulated waiting - the same
// design precedent as svi_engine.py's suicidal-ideation floor, which is
// also allowed to override the "normal" computation:
//   - statutoryUrgencyBonus (cap 25): the SC/ST (Prevention of Atrocities)
//     Act mandates investigation timelines. Derived purely from
//     complaint.createdAt (no new column needed) against a disclosed
//     POLICY CONSTANT below - a missed statutory deadline is a compliance
//     failure regardless of how severe the case reads, so this is allowed
//     to compete with fresh severity.
//   - retaliationBonus (cap 20): counts real re-contacts on this case via
//     the case-linking mechanism (caseLinking.service.ts / task #115),
//     which today only prevents fragmentation but does nothing with the
//     signal that a victim contacting an already-open, unresolved case
//     again is itself a strong urgency signal.
//   - reviewUncertaintyBonus (flat 8): when the SVI band is HIGH/CRITICAL
//     but the model's own confidence is low, this nudges it toward faster
//     human review - a wrongly-under-triaged severe case is far costlier
//     than a wrongly-over-triaged moderate one, so uncertainty at the top
//     of the range should pull a human in, not quietly rank lower.
//
// DISCLOSED POLICY CONSTANTS - none of these are derived from the SVI
// formula or any dataset; they are triage-design choices matching the
// existing pattern (SUICIDAL_IDEATION_FLOOR, AUTHORITY_ESCALATION in
// svi_engine.py; AGING_RATE_PER_HOUR in v1 of this file). A legal reviewer
// familiar with actual SC/ST Act timelines, and a social-work reviewer
// familiar with real caseloads, should sign off on the numbers below before
// this drives real staff prioritization - especially STATUTORY_INVESTIGATION_DAYS,
// which can vary by state-level Rules amendments.
export const AGING_CAP = 15;
export const AGING_TAU_HOURS = 24; // hours to reach ~63% of the aging cap

export const VULNERABILITY_CAP = 8;
export const VULNERABILITY_UNDER_12_BONUS = 8;
export const VULNERABILITY_MINOR_BONUS = 5; // age 12-17
export const VULNERABILITY_ELDERLY_BONUS = 5; // age > 65
export const VULNERABILITY_ELDERLY_AGE = 65;
export const VULNERABILITY_MINOR_AGE = 18;
export const VULNERABILITY_YOUNG_CHILD_AGE = 12;

export const TREND_RATE = 0.2;
export const TREND_CAP = 7;

// SC/ST (Prevention of Atrocities) Rules: investigation/chargesheet target
// of 60 days from FIR is the commonly-cited statutory window. Real state
// Rules vary - this is a starting default, not a verified legal fact.
export const STATUTORY_INVESTIGATION_DAYS = 60;
export const STATUTORY_WARNING_WINDOW_DAYS = 15; // start ramping urgency this many days before the deadline
export const STATUTORY_URGENCY_CAP = 25;
// Once the deadline is missed, urgency starts at 80% of cap and creeps
// toward the full cap the longer it stays missed, rather than jumping
// straight to max - a deadline missed by 1 day and one missed by 60 days
// are both real compliance failures, but not equally so.
export const STATUTORY_BREACH_BASE_FRACTION = 0.8;
export const STATUTORY_BREACH_GROWTH_PER_DAY = 0.2;

export const RETALIATION_CAP = 20;
export const RETALIATION_PER_RECONTACT = 10;

export const REVIEW_UNCERTAINTY_BONUS = 8;
export const REVIEW_UNCERTAINTY_CONFIDENCE_THRESHOLD = 65;

export interface PriorityBreakdown {
  sviValue: number;
  hoursWaiting: number;
  agingBonus: number;
  vulnerabilityBonus: number;
  trendBonus: number;
  statutoryUrgencyBonus: number;
  retaliationBonus: number;
  reviewUncertaintyBonus: number;
  priorityScore: number;
  lastActionAt: string;
  lastActionSummary: string;
  reasons: string[]; // human-readable list of which tier-3/notable factors actually fired
}

export interface ComputePriorityInputs {
  sviValue: number;
  sviBand: string;
  sviConfidence: number;
  lastActionAt: Date;
  lastActionSummary: string;
  victimAge: number | null;
  previousSviValue: number | null;
  complaintFiledAt: Date;
  linkedRecontactCount: number;
  now?: Date;
}

function computeAgingBonus(hoursWaiting: number): number {
  return AGING_CAP * (1 - Math.exp(-hoursWaiting / AGING_TAU_HOURS));
}

function computeVulnerabilityBonus(age: number | null): number {
  if (age == null) return 0;
  if (age < VULNERABILITY_YOUNG_CHILD_AGE) return VULNERABILITY_UNDER_12_BONUS;
  if (age < VULNERABILITY_MINOR_AGE) return VULNERABILITY_MINOR_BONUS;
  if (age > VULNERABILITY_ELDERLY_AGE) return VULNERABILITY_ELDERLY_BONUS;
  return 0;
}

function computeTrendBonus(current: number, previous: number | null): number {
  if (previous == null) return 0;
  const delta = current - previous;
  if (delta <= 0) return 0; // improving/stable trends earn nothing - never a penalty
  return Math.min(TREND_CAP, delta * TREND_RATE);
}

function computeStatutoryUrgencyBonus(complaintFiledAt: Date, now: Date): number {
  const deadline = new Date(complaintFiledAt.getTime() + STATUTORY_INVESTIGATION_DAYS * 24 * 60 * 60 * 1000);
  const daysToDeadline = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

  if (daysToDeadline <= 0) {
    const daysOverdue = -daysToDeadline;
    return Math.min(STATUTORY_URGENCY_CAP, STATUTORY_URGENCY_CAP * STATUTORY_BREACH_BASE_FRACTION + daysOverdue * STATUTORY_BREACH_GROWTH_PER_DAY);
  }
  if (daysToDeadline > STATUTORY_WARNING_WINDOW_DAYS) return 0;

  const progress = (STATUTORY_WARNING_WINDOW_DAYS - daysToDeadline) / STATUTORY_WARNING_WINDOW_DAYS;
  return STATUTORY_URGENCY_CAP * STATUTORY_BREACH_BASE_FRACTION * progress;
}

function computeRetaliationBonus(linkedRecontactCount: number): number {
  return Math.min(RETALIATION_CAP, linkedRecontactCount * RETALIATION_PER_RECONTACT);
}

function computeReviewUncertaintyBonus(sviBand: string, sviConfidence: number): number {
  const isHighStakes = sviBand === 'HIGH' || sviBand === 'CRITICAL';
  return isHighStakes && sviConfidence < REVIEW_UNCERTAINTY_CONFIDENCE_THRESHOLD ? REVIEW_UNCERTAINTY_BONUS : 0;
}

export function computePriority(inputs: ComputePriorityInputs): PriorityBreakdown {
  const now = inputs.now ?? new Date();
  const hoursWaiting = Math.max(0, (now.getTime() - inputs.lastActionAt.getTime()) / (1000 * 60 * 60));

  const agingBonus = computeAgingBonus(hoursWaiting);
  const vulnerabilityBonus = computeVulnerabilityBonus(inputs.victimAge);
  const trendBonus = computeTrendBonus(inputs.sviValue, inputs.previousSviValue);
  const statutoryUrgencyBonus = computeStatutoryUrgencyBonus(inputs.complaintFiledAt, now);
  const retaliationBonus = computeRetaliationBonus(inputs.linkedRecontactCount);
  const reviewUncertaintyBonus = computeReviewUncertaintyBonus(inputs.sviBand, inputs.sviConfidence);

  const priorityScore = Math.min(
    100,
    inputs.sviValue + agingBonus + vulnerabilityBonus + trendBonus + statutoryUrgencyBonus + retaliationBonus + reviewUncertaintyBonus,
  );

  const reasons: string[] = [];
  if (statutoryUrgencyBonus >= STATUTORY_URGENCY_CAP * STATUTORY_BREACH_BASE_FRACTION) reasons.push('Statutory investigation deadline missed');
  else if (statutoryUrgencyBonus > 0) reasons.push('Statutory investigation deadline approaching');
  if (retaliationBonus > 0) reasons.push(`Re-contacted ${inputs.linkedRecontactCount}x after original complaint`);
  if (reviewUncertaintyBonus > 0) reasons.push('Low model confidence on a high-severity read - needs human review');
  if (vulnerabilityBonus > 0) reasons.push('Recorded victim age indicates heightened vulnerability');
  if (trendBonus > 0) reasons.push('Distress trending worse across recent assessments');

  return {
    sviValue: Math.round(inputs.sviValue * 10) / 10,
    hoursWaiting: Math.round(hoursWaiting * 10) / 10,
    agingBonus: Math.round(agingBonus * 10) / 10,
    vulnerabilityBonus: Math.round(vulnerabilityBonus * 10) / 10,
    trendBonus: Math.round(trendBonus * 10) / 10,
    statutoryUrgencyBonus: Math.round(statutoryUrgencyBonus * 10) / 10,
    retaliationBonus: Math.round(retaliationBonus * 10) / 10,
    reviewUncertaintyBonus: Math.round(reviewUncertaintyBonus * 10) / 10,
    priorityScore: Math.round(priorityScore * 10) / 10,
    lastActionAt: inputs.lastActionAt.toISOString(),
    lastActionSummary: inputs.lastActionSummary,
    reasons,
  };
}

// Real re-contact count per case: how many times a new complaint from the
// same victim was linked onto this already-open case instead of fragmenting
// into a new one (see caseLinking.service.ts). One query for every case in
// the queue, not one query per case.
async function getRecontactCounts(prisma: PrismaClient, caseIds: string[]): Promise<Map<string, number>> {
  if (caseIds.length === 0) return new Map();
  const rows = await prisma.caseTimeline.groupBy({
    by: ['caseId'],
    where: { caseId: { in: caseIds }, eventType: 'note', metaJson: { contains: 'linkedComplaintId' } },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.caseId, r._count._all]));
}

// Excludes CLOSED cases - a resolved case has nothing left to triage.
export async function getPriorityQueue(prisma: PrismaClient, limit: number) {
  const cases = await prisma.case.findMany({
    where: { status: { not: 'CLOSED' } },
    include: {
      victim: true,
      complaint: true,
      assignments: { where: { active: true }, include: { user: { select: { fullName: true, designation: true } } } },
      // take: 2, not 1 - the second-most-recent SVI value is what the trend
      // signal compares against.
      assessments: { orderBy: { createdAt: 'desc' }, take: 2, include: { sviScore: true, stressScore: true } },
      timeline: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });

  const recontactCounts = await getRecontactCounts(prisma, cases.map((c) => c.id));
  const now = new Date();

  const ranked = cases.map((c) => {
    const [latest, previous] = c.assessments;
    const sviValue = latest?.sviScore?.value ?? 0;
    const sviBand = latest?.sviScore?.band ?? 'LOW';
    // No assessment yet means nothing has been computed to be uncertain
    // about, so this must not spuriously trigger the uncertainty bonus.
    const sviConfidence = latest?.stressScore?.confidence ?? 100;
    const previousSviValue = previous?.sviScore?.value ?? null;
    const lastEvent = c.timeline[0];
    const lastActionAt = lastEvent?.createdAt ?? c.openedAt;
    const lastActionSummary = lastEvent?.summary ?? 'Case opened, no activity yet';

    const priority = computePriority({
      sviValue,
      sviBand,
      sviConfidence,
      lastActionAt,
      lastActionSummary,
      victimAge: c.victim.age,
      previousSviValue,
      complaintFiledAt: c.complaint.createdAt,
      linkedRecontactCount: recontactCounts.get(c.id) ?? 0,
      now,
    });

    return {
      caseId: c.id,
      caseNumber: c.caseNumber,
      status: c.status,
      riskLevel: c.riskLevel,
      openedAt: c.openedAt,
      victim: { displayCode: c.victim.displayCode, district: c.victim.district, state: c.victim.state },
      incidentType: c.complaint.incidentType,
      assignedTo: c.assignments.map((a) => ({ name: a.user.fullName, role: a.role })),
      priority,
    };
  });

  ranked.sort((a, b) => {
    if (b.priority.priorityScore !== a.priority.priorityScore) return b.priority.priorityScore - a.priority.priorityScore;
    // Tie-break: whichever case has waited longer since its last real action goes first.
    return new Date(a.priority.lastActionAt).getTime() - new Date(b.priority.lastActionAt).getTime();
  });

  return ranked.slice(0, limit).map((r, i) => ({ rank: i + 1, ...r }));
}
