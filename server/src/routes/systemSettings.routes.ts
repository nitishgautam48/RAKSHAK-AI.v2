import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { pStr } from '../lib/query.js';
import { recordAudit } from '../services/audit.service.js';
import { RoleName } from '@prisma/client';

export const systemSettingsRouter = Router();
systemSettingsRouter.use(requireAuth);

systemSettingsRouter.get('/', asyncHandler(async (_req, res) => {
  const rows = await prisma.systemSetting.findMany({ orderBy: { key: 'asc' } });
  res.json(rows);
}));

const putSchema = z.object({ value: z.string() });

systemSettingsRouter.put(
  '/:key',
  requireRoles(RoleName.ADMINISTRATOR, RoleName.STATE_ADMINISTRATOR, RoleName.MINISTRY_OFFICIAL),
  asyncHandler(async (req, res) => {
    const body = putSchema.parse(req.body);
    const key = pStr(req, 'key');
    const setting = await prisma.systemSetting.upsert({
      where: { key },
      update: { value: body.value },
      create: { key, value: body.value },
    });
    await recordAudit({ req, action: 'UPDATE', entityType: 'SystemSetting', entityId: setting.id, meta: { key: setting.key } });
    res.json(setting);
  }),
);
