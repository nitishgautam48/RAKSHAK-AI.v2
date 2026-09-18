import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { parsePagination, paginated } from '../lib/pagination.js';
import { qStr } from '../lib/query.js';
import { runRetentionSweep } from '../services/retention.service.js';
import { recordAudit } from '../services/audit.service.js';
import { RoleName } from '@prisma/client';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRoles(RoleName.ADMINISTRATOR, RoleName.STATE_ADMINISTRATOR, RoleName.MINISTRY_OFFICIAL));

adminRouter.get('/audit-log', asyncHandler(async (req, res) => {
  const { page, pageSize, skip, take } = parsePagination(req);
  const entityType = qStr(req, 'entityType');
  const where = entityType ? { entityType } : {};
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: { user: { select: { fullName: true, email: true } } } }),
    prisma.auditLog.count({ where }),
  ]);
  res.json(paginated(items, total, page, pageSize));
}));

adminRouter.post('/retention/run', asyncHandler(async (req, res) => {
  const result = await runRetentionSweep();
  await recordAudit({ req, action: 'DELETE', entityType: 'RetentionSweep', meta: result });
  res.json(result);
}));

adminRouter.get('/users', asyncHandler(async (req, res) => {
  const users = await prisma.user.findMany({
    where: { userType: 'GOVERNMENT' },
    select: { id: true, fullName: true, email: true, employeeId: true, department: true, district: true, state: true, role: { select: { name: true } } },
    orderBy: { fullName: 'asc' },
  });
  res.json(users);
}));
