import type { PrismaClient } from '@prisma/client';

// Real case de-duplication. Before this existed, EVERY complaint (even a
// second filing by a survivor who already has an open case) created a
// brand-new Case row - Case.complaintId is a unique, required field in
// schema.prisma, enforcing exactly one case per complaint with no concept
// of "this is the same person's ongoing situation." A survivor who
// re-contacted the helpline would fragment into multiple disconnected
// cases, each invisible to staff working the others.
//
// This is deliberately NOT a full relational fix (that needs a real schema
// change - Case.complaintId's unique constraint would need to become a
// one-to-many Complaint -> Case link, which is out of scope while database
// changes are on hold). What this does instead, with zero schema changes:
// when a victim already has an open (non-CLOSED) case, a new complaint from
// them does not spawn a second case - it's recorded as a real Complaint row
// (the historical narrative is preserved), and the EXISTING case gets a
// timeline entry referencing it, plus a notification to assigned staff.
// Read paths that resolve "this complaint's case" via the direct FK (most
// of the UI) will correctly show no dedicated case for the newer complaint
// row - callers that need to show "this was merged into case X" should use
// the linkedCaseId this returns at complaint-creation time, which is the
// one moment this information is available without a schema change.

export async function findOpenCaseForVictim(prisma: PrismaClient, victimId: string) {
  return prisma.case.findFirst({
    where: { victimId, status: { not: 'CLOSED' } },
    orderBy: { openedAt: 'desc' },
    include: { assignments: { where: { active: true } } },
  });
}
