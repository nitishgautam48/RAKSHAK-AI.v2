import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { qStr } from '../lib/query.js';
import { recordConsent } from '../services/consent.service.js';
import { recordAudit } from '../services/audit.service.js';
import { prisma } from '../lib/prisma.js';

export const consentRouter = Router();
consentRouter.use(requireAuth);

const createSchema = z.object({
  victimId: z.string().min(1),
  scope: z.enum(['data_sharing', 'ai_assessment', 'video_recording', 'research']),
  granted: z.boolean(),
  expiresAt: z.string().datetime().optional(),
});

consentRouter.post('/', asyncHandler(async (req, res) => {
  const body = createSchema.parse(req.body);
  const record = await recordConsent({
    victimId: body.victimId,
    userId: req.user!.sub.startsWith('emergency:') ? undefined : req.user!.sub,
    scope: body.scope,
    granted: body.granted,
    expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
  });
  await recordAudit({ req, action: 'CREATE', entityType: 'ConsentRecord', entityId: record.id, meta: { scope: body.scope, granted: body.granted } });
  res.status(201).json(record);
}));

consentRouter.get('/', asyncHandler(async (req, res) => {
  const victimId = qStr(req, 'victimId');
  const items = await prisma.consentRecord.findMany({
    where: victimId ? { victimId } : {},
    orderBy: { recordedAt: 'desc' },
  });
  res.json(items);
}));

// Real counts by scope/granted, for the Privacy & Ethics Center - every
// number here is a live COUNT over ConsentRecord, not a static disclosure.
consentRouter.get('/stats', asyncHandler(async (_req, res) => {
  const rows = await prisma.consentRecord.groupBy({ by: ['scope', 'granted'], _count: { scope: true } });
  const totalVictims = await prisma.victim.count();
  res.json({ totalVictims, byScope: rows.map((r) => ({ scope: r.scope, granted: r.granted, count: r._count.scope })) });
}));
