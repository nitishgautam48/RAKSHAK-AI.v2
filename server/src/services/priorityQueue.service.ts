import type { PrismaClient } from '@prisma/client';

// Real staff-facing case ranking. Before this existed, EVERY list endpoint
// in this codebase (complaints, cases, interventions, SOS) ordered strictly
// by createdAt desc - risk band/SVI value were displayable and filterable,
// but never actually used to order who staff should look at first. Two
// CRITICAL cases filed on the same day were indistinguishable in rank, and
// a case that nobody actioned would sit at whatever position recency put it
// in forever, with no mechanism to resurface it.
//
// priorityScore = min(100, sviValue + agingBonus)
//
//   sviValue: the case's most recent assessment's SVI value (0-100). This
//   is the primary ranking signal, and it already bakes in the suicidal-
//   ideation safety floor and prior-escalation weighting (see
//   ai-service/app/engines/svi_engine.py) - deliberately NOT re-applying a
//   separate tie-break bonus for those same factors here, which would
//   double-count a signal SVI already reflects.
//
//   agingBonus: a small, disclosed, capped bonus for time spent unactioned
//   (see AGING_RATE_PER_HOUR/AGING_CAP below) - a genuine triage-queue
//   pattern (the same idea behind ED "time to be seen" targets per acuity
//   level): a case nobody has touched in a long time should eventually
//   surface even against a fresher, more severe one, but a merely-waiting
//   MODERATE case must never be able to fully leapfrog a freshly-filed
//   CRITICAL one - only close a partial gap. The exact rate is a POLICY
//   CALIBRATION, not something derivable from the SVI formula itself; a
//   legal/social-work reviewer familiar with real caseloads should sign off
//   on these numbers before relying on them operationally, exactly like the
//   other disclosed policy constants in this codebase (SUICIDAL_IDEATION_FLOOR,
//   AUTHORITY_ESCALATION in svi_engine.py).
//
//   Concrete worked example with the numbers below: a MODERATE case sitting
//   at SVI 40, left completely unactioned, gains +12 after 24 hours (score
//   52) and +20 (the cap) after ~40 hours (score 60) - enough to overtake a
//   freshly-filed case in the low end of HIGH (55-59), but never enough on
//   its own to overtake a freshly-filed CRITICAL case (75+).
export const AGING_RATE_PER_HOUR = 0.5;
export const AGING_CAP = 20;

export interface PriorityBreakdown {
  sviValue: number;
  hoursWaiting: number;
  agingBonus: number;
  priorityScore: number;
  lastActionAt: string;
  lastActionSummary: string;
}

export function computePriority(sviValue: number, lastActionAt: Date, lastActionSummary: string, now: Date = new Date()): PriorityBreakdown {
  const hoursWaiting = Math.max(0, (now.getTime() - lastActionAt.getTime()) / (1000 * 60 * 60));
  const agingBonus = Math.min(AGING_CAP, hoursWaiting * AGING_RATE_PER_HOUR);
  const priorityScore = Math.min(100, sviValue + agingBonus);
  return {
    sviValue: Math.round(sviValue * 10) / 10,
    hoursWaiting: Math.round(hoursWaiting * 10) / 10,
    agingBonus: Math.round(agingBonus * 10) / 10,
    priorityScore: Math.round(priorityScore * 10) / 10,
    lastActionAt: lastActionAt.toISOString(),
    lastActionSummary,
  };
}

// Excludes CLOSED cases - a resolved case has nothing left to triage.
export async function getPriorityQueue(prisma: PrismaClient, limit: number) {
  const cases = await prisma.case.findMany({
    where: { status: { not: 'CLOSED' } },
    include: {
      victim: true,
      complaint: true,
      assignments: { where: { active: true }, include: { user: { select: { fullName: true, designation: true } } } },
      assessments: { orderBy: { createdAt: 'desc' }, take: 1, include: { sviScore: true } },
      timeline: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });

  const now = new Date();
  const ranked = cases.map((c) => {
    const sviValue = c.assessments[0]?.sviScore?.value ?? 0;
    const lastEvent = c.timeline[0];
    const lastActionAt = lastEvent?.createdAt ?? c.openedAt;
    const lastActionSummary = lastEvent?.summary ?? 'Case opened, no activity yet';
    const priority = computePriority(sviValue, lastActionAt, lastActionSummary, now);
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
