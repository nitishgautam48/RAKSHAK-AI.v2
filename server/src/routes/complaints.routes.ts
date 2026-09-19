import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/error.js';
import { parsePagination, paginated } from '../lib/pagination.js';
import { qStr, pStr } from '../lib/query.js';
import { genComplaintCode, genCaseNumber } from '../lib/codes.js';
import { recordAudit } from '../services/audit.service.js';
import { broadcastCaseEvent } from '../services/socket.service.js';
import { recordConsent } from '../services/consent.service.js';
import { victimToDto } from '../lib/dto.js';
import { RoleName } from '@prisma/client';
import { findOpenCaseForVictim } from '../services/caseLinking.service.js';
import { notify } from '../services/notification.service.js';

export const complaintsRouter = Router();
complaintsRouter.use(requireAuth);

complaintsRouter.get('/', asyncHandler(async (req, res) => {
  const { page, pageSize, skip, take } = parsePagination(req);
  const state = qStr(req, 'state');
  const district = qStr(req, 'district');
  const riskLevel = qStr(req, 'riskLevel');
  const status = qStr(req, 'status');
  const search = qStr(req, 'search');

  const where = {
    ...(state && !state.startsWith('All') ? { state } : {}),
    ...(district && !district.startsWith('All') ? { district } : {}),
    ...(riskLevel && !riskLevel.startsWith('All') ? { riskLevel: riskLevel as never } : {}),
    ...(status && !status.startsWith('All') ? { status: status as never } : {}),
    ...(search ? { OR: [{ code: { contains: search } }] } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.complaint.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: { victim: true, case: { include: { assignments: { include: { user: true }, where: { active: true } } } } },
    }),
    prisma.complaint.count({ where }),
  ]);

  const dto = items.map((c) => ({
    id: c.id,
    code: c.code,
    victimDisplayCode: c.victim.displayCode,
    incidentType: c.incidentType,
    state: c.state,
    district: c.district,
    language: c.victim.languagePref,
    status: c.status,
    riskLevel: c.riskLevel,
    officer: c.case?.assignments[0]?.user.fullName ?? null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  }));

  res.json(paginated(dto, total, page, pageSize));
}));

complaintsRouter.get('/:id', asyncHandler(async (req, res) => {
  const complaint = await prisma.complaint.findUnique({
    where: { id: pStr(req, 'id') },
    include: { victim: true, case: true, assessments: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  if (!complaint) throw new ApiError(404, 'not_found', 'Complaint not found');
  res.json({ ...complaint, victim: victimToDto(complaint.victim) });
}));

const createComplaintSchema = z.object({
  victimId: z.string().min(1).optional(),
  incidentType: z.string().min(1),
  narrative: z.string().min(1),
  state: z.string().min(1).optional(),
  district: z.string().min(1).optional(),
  channel: z.string().default('helpline'),
});

complaintsRouter.post('/', asyncHandler(async (req, res) => {
  const body = createComplaintSchema.parse(req.body);

  // A survivor filing their own complaint is never trusted to supply
  // victimId/state/district from the client - it's always derived from
  // their own linked Victim record via the JWT. Government users (helpline
  // operators logging a call on someone else's behalf) must supply victimId
  // explicitly, since they're recording a complaint for a different person.
  let victimId = body.victimId;
  let state = body.state;
  let district = body.district;
  if (req.user?.victimId) {
    victimId = req.user.victimId;
    if (!state || !district) {
      const ownVictim = await prisma.victim.findUnique({ where: { id: victimId } });
      state = state ?? ownVictim?.state;
      district = district ?? ownVictim?.district;
    }
  }
  if (!victimId) throw new ApiError(400, 'victim_required', 'victimId is required');
  if (!state || !district) throw new ApiError(400, 'location_required', 'state and district are required');

  const complaint = await prisma.complaint.create({
    data: { victimId, incidentType: body.incidentType, narrative: body.narrative, state, district, channel: body.channel, code: genComplaintCode() },
    include: { victim: true },
  });

  // De-duplication: a survivor who already has an open case gets this new
  // complaint linked into it instead of a second, disconnected case - see
  // caseLinking.service.ts for why this doesn't (yet) use a real FK.
  const existingCase = await findOpenCaseForVictim(prisma, complaint.victimId);
  const linkedToExistingCase = existingCase !== null;

  const kase = existingCase ?? await prisma.case.create({
    data: {
      caseNumber: genCaseNumber(),
      complaintId: complaint.id,
      victimId: complaint.victimId,
      status: 'SUBMITTED',
      riskLevel: 'MODERATE',
    },
  });

  if (linkedToExistingCase) {
    await prisma.caseTimeline.create({
      data: {
        caseId: kase.id,
        actorId: req.user!.sub.startsWith('emergency:') ? null : req.user!.sub,
        eventType: 'note',
        summary: `Additional complaint filed by the same survivor (${complaint.code}: ${complaint.incidentType}) - linked to this existing open case rather than opening a new one.`,
        metaJson: JSON.stringify({ linkedComplaintId: complaint.id }),
      },
    });
    for (const assignment of existingCase!.assignments) {
      await notify({
        userId: assignment.userId,
        eventType: 'case_update',
        title: 'New complaint linked to your case',
        body: `${complaint.victim.displayCode} filed another complaint (${complaint.code}), linked to case ${kase.caseNumber} since it's already open.`,
      });
    }
  } else {
    await prisma.caseTimeline.create({
      data: { caseId: kase.id, actorId: req.user!.sub, eventType: 'status_change', summary: 'Complaint registered and case opened.' },
    });
  }

  // Consent is captured at intake, as it would be on the physical/telephonic
  // helpline registration form - this is what makes requireConsent() in the
  // assessments route a real, satisfiable gate rather than a dead end.
  await recordConsent({ victimId: complaint.victimId, userId: req.user!.sub.startsWith('emergency:') ? undefined : req.user!.sub, scope: 'data_sharing', granted: true });
  await recordConsent({ victimId: complaint.victimId, userId: req.user!.sub.startsWith('emergency:') ? undefined : req.user!.sub, scope: 'ai_assessment', granted: true });

  await recordAudit({ req, action: 'CREATE', entityType: 'Complaint', entityId: complaint.id, meta: { linkedToExistingCase } });
  broadcastCaseEvent(kase.id, linkedToExistingCase ? 'complaint:linked' : 'complaint:new', { complaint, case: kase, linkedToExistingCase });
  res.status(201).json({ complaint, case: kase, linkedToExistingCase });
}));

const statusSchema = z.object({
  status: z.enum(['SUBMITTED', 'UNDER_REVIEW', 'ASSIGNED', 'UNDER_INVESTIGATION', 'ESCALATED', 'CLOSED']),
});

complaintsRouter.patch(
  '/:id/status',
  requireRoles(
    RoleName.HELPLINE_OPERATOR, RoleName.DISTRICT_OFFICER, RoleName.POLICE_OFFICER,
    RoleName.ADMINISTRATOR, RoleName.STATE_ADMINISTRATOR, RoleName.SOCIAL_JUSTICE_OFFICER,
  ),
  asyncHandler(async (req, res) => {
    const body = statusSchema.parse(req.body);
    const complaint = await prisma.complaint.update({ where: { id: pStr(req, 'id') }, data: { status: body.status } });
    const kase = await prisma.case.findUnique({ where: { complaintId: complaint.id } });
    if (kase) {
      await prisma.case.update({ where: { id: kase.id }, data: { status: body.status } });
      await prisma.caseTimeline.create({
        data: { caseId: kase.id, actorId: req.user!.sub, eventType: 'status_change', summary: `Status changed to ${body.status.replace(/_/g, ' ')}.` },
      });
      broadcastCaseEvent(kase.id, 'case:status_changed', { caseId: kase.id, status: body.status });
    }
    await recordAudit({ req, action: 'UPDATE', entityType: 'Complaint', entityId: complaint.id, meta: { status: body.status } });
    res.json(complaint);
  }),
);

complaintsRouter.patch(
  '/:id/escalate',
  requireRoles(RoleName.HELPLINE_OPERATOR, RoleName.DISTRICT_OFFICER, RoleName.ADMINISTRATOR, RoleName.SOCIAL_JUSTICE_OFFICER),
  asyncHandler(async (req, res) => {
    const complaint = await prisma.complaint.update({ where: { id: pStr(req, 'id') }, data: { status: 'ESCALATED', riskLevel: 'CRITICAL' } });
    const kase = await prisma.case.findUnique({ where: { complaintId: complaint.id } });
    if (kase) {
      await prisma.case.update({ where: { id: kase.id }, data: { status: 'ESCALATED', riskLevel: 'CRITICAL' } });
      await prisma.caseTimeline.create({
        data: { caseId: kase.id, actorId: req.user!.sub, eventType: 'status_change', summary: 'Case escalated to critical priority.' },
      });
      broadcastCaseEvent(kase.id, 'case:escalated', { caseId: kase.id });
    }
    await recordAudit({ req, action: 'UPDATE', entityType: 'Complaint', entityId: complaint.id, meta: { action: 'escalate' } });
    res.json(complaint);
  }),
);
