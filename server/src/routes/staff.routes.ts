import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { qStr } from '../lib/query.js';
import type { RoleName } from '@prisma/client';

export const staffRouter = Router();
staffRouter.use(requireAuth);

// Directory listing for pickers (assign officer, schedule with counsellor,
// etc.) - deliberately lighter-weight than /api/admin/users, which is
// restricted to administrators for full account management.
staffRouter.get('/', asyncHandler(async (req, res) => {
  const role = qStr(req, 'role');
  const users = await prisma.user.findMany({
    where: { userType: 'GOVERNMENT', ...(role ? { role: { name: role as RoleName } } : {}) },
    select: { id: true, fullName: true, department: true, district: true, state: true, role: { select: { name: true } } },
    orderBy: { fullName: 'asc' },
  });
  res.json(users);
}));
