import type { PrismaClient } from '@prisma/client';

// Real current open-caseload count per officer - staff.routes.ts's picker
// endpoint previously listed candidates alphabetically with zero visibility
// into who was already overloaded, so assignment was effectively random
// with respect to workload. This is a genuine count (active CaseAssignment
// rows whose case isn't CLOSED), not an estimate.
export async function getOpenCaseCounts(prisma: PrismaClient, userIds: string[]): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();
  const assignments = await prisma.caseAssignment.findMany({
    where: { userId: { in: userIds }, active: true, case: { status: { not: 'CLOSED' } } },
    select: { userId: true },
  });
  const counts = new Map<string, number>(userIds.map((id) => [id, 0]));
  for (const a of assignments) counts.set(a.userId, (counts.get(a.userId) ?? 0) + 1);
  return counts;
}
