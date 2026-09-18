import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/error.js';
import { qStr, pStr } from '../lib/query.js';
import { recordAudit } from '../services/audit.service.js';
import { broadcastCaseEvent, broadcastToVictim } from '../services/socket.service.js';
import { RoleName } from '@prisma/client';

export const legalAidRouter = Router();
legalAidRouter.use(requireAuth);

async function notifyVictimOfCase(caseId: string, event: string, payload: unknown) {
  const kase = await prisma.case.findUnique({ where: { id: caseId }, include: { victim: { include: { profile: true } } } });
  if (kase?.victim.profile) broadcastToVictim(kase.victim.profile.userId, event, payload);
  broadcastCaseEvent(caseId, event, payload);
}

legalAidRouter.get('/', asyncHandler(async (req, res) => {
  const victimId = qStr(req, 'victimId');
  const caseId = qStr(req, 'caseId');
  const items = await prisma.legalAidRecord.findMany({
    where: { ...(victimId ? { victimId } : {}), ...(caseId ? { caseId } : {}) },
    include: { courtCase: { include: { hearings: true } }, compensation: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(items);
}));

const createSchema = z.object({
  victimId: z.string().min(1),
  caseId: z.string().min(1),
  lawyerName: z.string().optional(),
  lawyerContact: z.string().optional(),
  specialization: z.string().optional(),
});

legalAidRouter.post(
  '/',
  requireRoles(RoleName.LEGAL_OFFICER, RoleName.DISTRICT_OFFICER, RoleName.ADMINISTRATOR),
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const record = await prisma.legalAidRecord.create({ data: body });
    await prisma.caseTimeline.create({
      data: { caseId: body.caseId, actorId: req.user!.sub, eventType: 'legal', summary: `Legal aid assigned${body.lawyerName ? `: ${body.lawyerName}` : ''}.` },
    });
    await recordAudit({ req, action: 'CREATE', entityType: 'LegalAidRecord', entityId: record.id });
    await notifyVictimOfCase(body.caseId, 'legal:update', record);
    res.status(201).json(record);
  }),
);

const courtCaseSchema = z.object({ caseNumber: z.string().min(1), court: z.string().min(1), filedAt: z.string().datetime().optional() });

legalAidRouter.post(
  '/:id/court-case',
  requireRoles(RoleName.LEGAL_OFFICER, RoleName.ADMINISTRATOR),
  asyncHandler(async (req, res) => {
    const legalAid = await prisma.legalAidRecord.findUnique({ where: { id: pStr(req, 'id') } });
    if (!legalAid) throw new ApiError(404, 'not_found', 'Legal aid record not found');
    const body = courtCaseSchema.parse(req.body);
    const courtCase = await prisma.courtCase.create({
      data: { legalAidId: legalAid.id, caseNumber: body.caseNumber, court: body.court, filedAt: body.filedAt ? new Date(body.filedAt) : undefined },
    });
    await recordAudit({ req, action: 'CREATE', entityType: 'CourtCase', entityId: courtCase.id });
    await notifyVictimOfCase(legalAid.caseId, 'legal:update', courtCase);
    res.status(201).json(courtCase);
  }),
);

const hearingSchema = z.object({ label: z.string().min(1), scheduledAt: z.string().datetime(), status: z.enum(['upcoming', 'in_progress', 'completed']).default('upcoming'), notes: z.string().optional() });

legalAidRouter.post(
  '/court-cases/:id/hearings',
  requireRoles(RoleName.LEGAL_OFFICER, RoleName.ADMINISTRATOR),
  asyncHandler(async (req, res) => {
    const courtCase = await prisma.courtCase.findUnique({ where: { id: pStr(req, 'id') }, include: { legalAid: true } });
    if (!courtCase) throw new ApiError(404, 'not_found', 'Court case not found');
    const body = hearingSchema.parse(req.body);
    const hearing = await prisma.hearing.create({
      data: { courtCaseId: courtCase.id, label: body.label, scheduledAt: new Date(body.scheduledAt), status: body.status, notes: body.notes },
    });
    await prisma.caseTimeline.create({
      data: { caseId: courtCase.legalAid.caseId, actorId: req.user!.sub, eventType: 'legal', summary: `Hearing scheduled: ${body.label}.` },
    });
    await recordAudit({ req, action: 'CREATE', entityType: 'Hearing', entityId: hearing.id });
    await notifyVictimOfCase(courtCase.legalAid.caseId, 'legal:update', hearing);
    res.status(201).json(hearing);
  }),
);

const compensationSchema = z.object({
  stage: z.enum(['applied', 'under_review', 'approved', 'released']),
  amountApplied: z.number().optional(),
  amountApproved: z.number().optional(),
});

legalAidRouter.put(
  '/:id/compensation',
  requireRoles(RoleName.LEGAL_OFFICER, RoleName.DISTRICT_OFFICER, RoleName.ADMINISTRATOR),
  asyncHandler(async (req, res) => {
    const legalAid = await prisma.legalAidRecord.findUnique({ where: { id: pStr(req, 'id') } });
    if (!legalAid) throw new ApiError(404, 'not_found', 'Legal aid record not found');
    const body = compensationSchema.parse(req.body);
    const compensation = await prisma.compensationRecord.upsert({
      where: { legalAidId: legalAid.id },
      update: body,
      create: { legalAidId: legalAid.id, ...body },
    });
    await recordAudit({ req, action: 'UPDATE', entityType: 'CompensationRecord', entityId: compensation.id });
    await notifyVictimOfCase(legalAid.caseId, 'legal:update', compensation);
    res.json(compensation);
  }),
);
