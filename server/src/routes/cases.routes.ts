import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/error.js';
import { parsePagination, paginated } from '../lib/pagination.js';
import { qStr, pStr } from '../lib/query.js';
import { victimToDto, assignmentUserSelect } from '../lib/dto.js';
import { recordAudit } from '../services/audit.service.js';
import { broadcastCaseEvent, broadcastToVictim } from '../services/socket.service.js';
import { notify } from '../services/notification.service.js';
import { RoleName, AssignmentRole } from '@prisma/client';
import { getPriorityQueue } from '../services/priorityQueue.service.js';
import { runAutoEscalationCheck } from '../services/autoEscalation.service.js';

export const casesRouter = Router();
casesRouter.use(requireAuth);

// Real staff worklist ordering - see priorityQueue.service.ts for the full
// scoring rationale (severity + a disclosed, capped aging bonus for cases
// sitting unactioned). Declared before GET /:id so "priority-queue" isn't
// swallowed as a case id.
casesRouter.get('/priority-queue', asyncHandler(async (req, res) => {
  const limit = Math.min(200, Number(qStr(req, 'limit') ?? 50) || 50);
  res.json(await getPriorityQueue(prisma, limit));
}));

// Manual trigger for the same check index.ts runs on a 15-minute interval -
// lets an administrator force a check on demand rather than waiting for the
// next tick, and is how this is verified without waiting on a real timer.
casesRouter.post(
  '/priority-queue/run-escalation-check',
  requireRoles(RoleName.ADMINISTRATOR, RoleName.STATE_ADMINISTRATOR),
  asyncHandler(async (_req, res) => {
    const results = await runAutoEscalationCheck(prisma);
    res.json({ escalated: results.length, results });
  }),
);

casesRouter.get('/', asyncHandler(async (req, res) => {
  const { page, pageSize, skip, take } = parsePagination(req);
  const status = qStr(req, 'status');
  const where = status && !status.startsWith('All') ? { status: status as never } : {};
  const [items, total] = await Promise.all([
    prisma.case.findMany({
      where,
      skip,
      take,
      orderBy: { openedAt: 'desc' },
      include: { victim: true, complaint: true, assignments: { where: { active: true }, include: { user: { select: assignmentUserSelect } } } },
    }),
    prisma.case.count({ where }),
  ]);
  res.json(paginated(items, total, page, pageSize));
}));

// A victim's own case, resolved from their JWT rather than a path param, so
// the survivor portal never needs to know its own internal case id.
casesRouter.get('/mine', asyncHandler(async (req, res) => {
  if (!req.user?.victimId) throw new ApiError(403, 'not_a_survivor', 'No linked victim record for this account.');
  const kase = await prisma.case.findFirst({
    where: { victimId: req.user.victimId },
    orderBy: { openedAt: 'desc' },
    include: {
      victim: true,
      complaint: true,
      timeline: { orderBy: { createdAt: 'desc' }, take: 20 },
      assignments: { where: { active: true }, include: { user: { select: assignmentUserSelect } } },
      legalAid: { include: { courtCase: { include: { hearings: true } }, compensation: true } },
    },
  });
  if (!kase) return res.status(404).json({ error: 'no_case' });
  res.json({ ...kase, victim: victimToDto(kase.victim) });
}));

casesRouter.get('/:id', asyncHandler(async (req, res) => {
  const kase = await prisma.case.findUnique({
    where: { id: pStr(req, 'id') },
    include: {
      victim: true,
      complaint: true,
      timeline: { orderBy: { createdAt: 'desc' }, include: { actor: { select: { fullName: true } } } },
      assignments: { include: { user: { select: assignmentUserSelect } } },
      assessments: { orderBy: { createdAt: 'desc' }, include: { sviScore: true, riskScore: true } },
    },
  });
  if (!kase) throw new ApiError(404, 'not_found', 'Case not found');
  res.json({ ...kase, victim: victimToDto(kase.victim) });
}));

const assignSchema = z.object({ userId: z.string().min(1), role: z.nativeEnum(AssignmentRole) });

casesRouter.post(
  '/:id/assign',
  requireRoles(RoleName.DISTRICT_OFFICER, RoleName.ADMINISTRATOR, RoleName.STATE_ADMINISTRATOR, RoleName.SOCIAL_JUSTICE_OFFICER),
  asyncHandler(async (req, res) => {
    const body = assignSchema.parse(req.body);
    const kase = await prisma.case.findUnique({ where: { id: pStr(req, 'id') } });
    if (!kase) throw new ApiError(404, 'not_found', 'Case not found');

    const assignment = await prisma.caseAssignment.create({ data: { caseId: kase.id, userId: body.userId, role: body.role } });
    await prisma.case.update({ where: { id: kase.id }, data: { status: 'ASSIGNED' } });
    const assignedUser = await prisma.user.findUnique({ where: { id: body.userId } });
    await prisma.caseTimeline.create({
      data: { caseId: kase.id, actorId: req.user!.sub, eventType: 'assignment', summary: `${assignedUser?.fullName ?? 'Officer'} assigned as ${body.role.replace(/_/g, ' ')}.` },
    });

    await notify({ userId: body.userId, eventType: 'case_update', title: 'New case assignment', body: `You have been assigned to case ${kase.caseNumber}.` });
    broadcastCaseEvent(kase.id, 'case:assigned', { caseId: kase.id, assignment });
    await recordAudit({ req, action: 'UPDATE', entityType: 'Case', entityId: kase.id, meta: { action: 'assign', userId: body.userId } });
    res.status(201).json(assignment);
  }),
);

const noteSchema = z.object({ summary: z.string().min(1) });

casesRouter.post('/:id/notes', asyncHandler(async (req, res) => {
  const body = noteSchema.parse(req.body);
  const kase = await prisma.case.findUnique({ where: { id: pStr(req, 'id') }, include: { victim: { include: { profile: true } } } });
  if (!kase) throw new ApiError(404, 'not_found', 'Case not found');

  const entry = await prisma.caseTimeline.create({
    data: { caseId: kase.id, actorId: req.user!.sub, eventType: 'note', summary: body.summary },
  });

  broadcastCaseEvent(kase.id, 'case:timeline_update', entry);
  if (kase.victim.profile) {
    broadcastToVictim(kase.victim.profile.userId, 'case:timeline_update', entry);
  }
  await recordAudit({ req, action: 'CREATE', entityType: 'CaseTimeline', entityId: entry.id });
  res.status(201).json(entry);
}));

casesRouter.patch(
  '/:id/close',
  requireRoles(RoleName.DISTRICT_OFFICER, RoleName.ADMINISTRATOR, RoleName.STATE_ADMINISTRATOR),
  asyncHandler(async (req, res) => {
    const kase = await prisma.case.update({ where: { id: pStr(req, 'id') }, data: { status: 'CLOSED', closedAt: new Date() } });
    await prisma.caseTimeline.create({ data: { caseId: kase.id, actorId: req.user!.sub, eventType: 'status_change', summary: 'Case closed.' } });
    broadcastCaseEvent(kase.id, 'case:closed', { caseId: kase.id });
    await recordAudit({ req, action: 'UPDATE', entityType: 'Case', entityId: kase.id, meta: { action: 'close' } });
    res.json(kase);
  }),
);
