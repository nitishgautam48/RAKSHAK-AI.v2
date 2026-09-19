import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { qStr } from '../lib/query.js';
import type { RoleName } from '@prisma/client';
import { getOpenCaseCounts } from '../services/workload.service.js';

export const staffRouter = Router();
staffRouter.use(requireAuth);

// Directory listing for pickers (assign officer, schedule with counsellor,
// etc.) - deliberately lighter-weight than /api/admin/users, which is
// restricted to administrators for full account management.
//
// Now includes each candidate's real current open-caseload (openCaseCount)
// and sorts by it ascending when listing for assignment (default) - this
// used to be a plain alphabetical list with zero visibility into who was
// already overloaded, so a human picking an assignee had no way to avoid
// piling more cases onto someone already stretched thin. Pass
// sort=alphabetical to opt back into the old ordering (e.g. for a general
// directory view rather than an assignment picker).
staffRouter.get('/', asyncHandler(async (req, res) => {
  const role = qStr(req, 'role');
  const sort = qStr(req, 'sort') ?? 'workload';
  const users = await prisma.user.findMany({
    where: { userType: 'GOVERNMENT', ...(role ? { role: { name: role as RoleName } } : {}) },
    select: { id: true, fullName: true, department: true, district: true, state: true, role: { select: { name: true } } },
    orderBy: { fullName: 'asc' },
  });

  const counts = await getOpenCaseCounts(prisma, users.map((u) => u.id));
  const withWorkload = users.map((u) => ({ ...u, openCaseCount: counts.get(u.id) ?? 0 }));

  if (sort === 'workload') withWorkload.sort((a, b) => a.openCaseCount - b.openCaseCount);
  res.json(withWorkload);
}));
