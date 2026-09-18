import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/error.js';
import { qStr, pStr } from '../lib/query.js';
import { recordAudit } from '../services/audit.service.js';
import { broadcastCaseEvent } from '../services/socket.service.js';

export const interventionsRouter = Router();
interventionsRouter.use(requireAuth);

interventionsRouter.get('/', asyncHandler(async (req, res) => {
  const status = qStr(req, 'status');
  const items = await prisma.intervention.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: 'desc' },
    include: {
      case: { include: { victim: { select: { displayCode: true } }, complaint: { select: { code: true } } } },
      recommendation: { select: { rationale: true, confidence: true } },
    },
  });
  res.json(items);
}));

const createSchema = z.object({
  caseId: z.string().min(1),
  type: z.enum(['COUNSELLING', 'MEDICAL_AID', 'POLICE_PROTECTION', 'WITNESS_PROTECTION', 'LEGAL_AID', 'COMPENSATION_SUPPORT', 'SHELTER_SUPPORT', 'REHABILITATION_SUPPORT']),
  recommendationId: z.string().optional(),
  notes: z.string().optional(),
});

// Turns an AI recommendation (or a standalone officer decision) into a
// tracked intervention with its own status lifecycle - this is the bridge
// between "the AI suggested X" and "an officer is actually doing X".
interventionsRouter.post('/', asyncHandler(async (req, res) => {
  const body = createSchema.parse(req.body);
  const intervention = await prisma.intervention.create({ data: body });
  await prisma.caseTimeline.create({
    data: { caseId: body.caseId, actorId: req.user!.sub.startsWith('emergency:') ? null : req.user!.sub, eventType: 'note', summary: `Intervention started: ${body.type.replace(/_/g, ' ')}.` },
  });
  await recordAudit({ req, action: 'CREATE', entityType: 'Intervention', entityId: intervention.id });
  broadcastCaseEvent(body.caseId, 'intervention:update', intervention);
  res.status(201).json(intervention);
}));

const statusSchema = z.object({ status: z.enum(['pending', 'active', 'completed', 'declined']), notes: z.string().optional() });

interventionsRouter.patch('/:id/status', asyncHandler(async (req, res) => {
  const existing = await prisma.intervention.findUnique({ where: { id: pStr(req, 'id') } });
  if (!existing) throw new ApiError(404, 'not_found', 'Intervention not found');
  const body = statusSchema.parse(req.body);
  const intervention = await prisma.intervention.update({ where: { id: existing.id }, data: body });
  await recordAudit({ req, action: 'UPDATE', entityType: 'Intervention', entityId: intervention.id, meta: { status: body.status } });
  broadcastCaseEvent(intervention.caseId, 'intervention:update', intervention);
  res.json(intervention);
}));
