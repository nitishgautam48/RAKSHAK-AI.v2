import type { PrismaClient } from '@prisma/client';
import { getPriorityQueue } from './priorityQueue.service.js';
import { notify } from './notification.service.js';

// Closes the loop on priorityQueue.service.ts: the aging bonus there
// computes a real number, but nothing previously acted on it - a case
// could age indefinitely without anyone being told. This periodically
// checks the real priority queue and notifies staff when a case crosses
// one of two disclosed, independent triggers:
//
//   1. PRIORITY_THRESHOLD: the case's priority score (SVI + aging bonus)
//      has reached CRITICAL-equivalent territory (75, matching svi_engine.
//      py's own CRITICAL band cutoff) - whether it got there from raw
//      severity or from aging, staff should know either way.
//   2. STALE_HOURS_THRESHOLD: the case has had zero recorded action for a
//      long time regardless of severity - a real check-in is warranted
//      even for a lower-severity case that's simply been forgotten.
//
// Both are POLICY CALIBRATIONS, not derived values - same caveat as
// priorityQueue.service.ts's aging rate: a legal/social-work reviewer
// familiar with real caseloads should sign off on these before relying on
// them operationally.
//
// Idempotency: a case that keeps aging would otherwise re-trigger every
// single check. Before notifying, this looks for an existing 'auto_escalation'
// CaseTimeline entry with the SAME trigger reason within COOLDOWN_HOURS and
// skips if one exists - one notification per case per reason per cooldown
// window, not one per check interval.
export const PRIORITY_THRESHOLD = 75;
export const STALE_HOURS_THRESHOLD = 48;
export const COOLDOWN_HOURS = 24;

export interface EscalationTrigger {
  reason: 'priority_threshold' | 'stale_unactioned';
  message: string;
}

// Pure decision function - no I/O - so the trigger logic itself is directly
// unit-testable without a database.
export function evaluateEscalationTriggers(priorityScore: number, hoursWaiting: number): EscalationTrigger[] {
  const triggers: EscalationTrigger[] = [];
  if (priorityScore >= PRIORITY_THRESHOLD) {
    triggers.push({
      reason: 'priority_threshold',
      message: `Priority score reached ${priorityScore.toFixed(1)} (threshold ${PRIORITY_THRESHOLD}) - CRITICAL-equivalent territory.`,
    });
  }
  if (hoursWaiting >= STALE_HOURS_THRESHOLD) {
    triggers.push({
      reason: 'stale_unactioned',
      message: `No recorded action for ${hoursWaiting.toFixed(1)} hours (threshold ${STALE_HOURS_THRESHOLD}h).`,
    });
  }
  return triggers;
}

async function alreadyNotifiedRecently(prisma: PrismaClient, caseId: string, reason: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000);
  const existing = await prisma.caseTimeline.findFirst({
    where: {
      caseId,
      eventType: 'auto_escalation',
      createdAt: { gte: cutoff },
      metaJson: { contains: `"reason":"${reason}"` },
    },
  });
  return existing !== null;
}

export async function runAutoEscalationCheck(prisma: PrismaClient) {
  const queue = await getPriorityQueue(prisma, 500);
  const results: { caseId: string; caseNumber: string; reason: string; notified: number }[] = [];

  for (const item of queue) {
    const triggers = evaluateEscalationTriggers(item.priority.priorityScore, item.priority.hoursWaiting);
    for (const trigger of triggers) {
      if (await alreadyNotifiedRecently(prisma, item.caseId, trigger.reason)) continue;

      await prisma.caseTimeline.create({
        data: {
          caseId: item.caseId,
          actorId: null,
          eventType: 'auto_escalation',
          summary: `Auto-escalation (${trigger.reason}): ${trigger.message}`,
          metaJson: JSON.stringify({ reason: trigger.reason, priority: item.priority }),
        },
      });

      // Notify whoever is actually assigned; if nobody is, this can't sit
      // silent just because assignment fell through the cracks, so it goes
      // to administrators as a real fallback, not a dropped notification.
      const assignments = await prisma.caseAssignment.findMany({ where: { caseId: item.caseId, active: true }, select: { userId: true } });
      const recipientUserIds = assignments.length > 0
        ? assignments.map((a) => a.userId)
        : (await prisma.user.findMany({ where: { role: { name: 'ADMINISTRATOR' } }, select: { id: true } })).map((u) => u.id);

      for (const userId of recipientUserIds) {
        await notify({
          userId,
          eventType: 'case_update',
          title: `Case ${item.caseNumber} needs attention`,
          body: trigger.message,
        });
      }

      results.push({ caseId: item.caseId, caseNumber: item.caseNumber, reason: trigger.reason, notified: recipientUserIds.length });
    }
  }

  return results;
}
