import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/error.js';
import { parsePagination, paginated } from '../lib/pagination.js';
import { pStr } from '../lib/query.js';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get('/', asyncHandler(async (req, res) => {
  const { page, pageSize, skip, take } = parsePagination(req);
  const where = { userId: req.user!.sub };
  const [items, total, unread] = await Promise.all([
    prisma.notification.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { ...where, read: false } }),
  ]);
  res.json({ ...paginated(items, total, page, pageSize), unread });
}));

notificationsRouter.patch('/:id/read', asyncHandler(async (req, res) => {
  const existing = await prisma.notification.findUnique({ where: { id: pStr(req, 'id') } });
  if (!existing || existing.userId !== req.user!.sub) throw new ApiError(404, 'not_found', 'Notification not found');
  const notification = await prisma.notification.update({ where: { id: existing.id }, data: { read: true } });
  res.json(notification);
}));

notificationsRouter.patch('/read-all', asyncHandler(async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: req.user!.sub, read: false }, data: { read: true } });
  res.json({ ok: true });
}));
