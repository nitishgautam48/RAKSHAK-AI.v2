import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/error.js';
import { qStr, pStr } from '../lib/query.js';
import { runAssessment } from '../services/ai.service.js';
import { recordAudit } from '../services/audit.service.js';
import { broadcastCaseEvent, broadcastToVictim } from '../services/socket.service.js';
import { notify } from '../services/notification.service.js';
import { requireConsent } from '../services/consent.service.js';
import { persistAssessment } from '../services/assessment.service.js';
import { RoleName } from '@prisma/client';

export const assessmentsRouter = Router();
assessmentsRouter.use(requireAuth);

// Extracted as a pure, exported function (not inlined in the route handler)
// specifically so the exact bug this fixes - a filter param silently
// accepted by callers but never applied - has a real regression test rather
// than only having been caught by manual live verification. See
// __tests__/assessmentsFilter.test.ts.
export function buildAssessmentListWhere(params: { victimId?: string; caseId?: string; complaintId?: string }) {
  return {
    ...(params.victimId ? { victimId: params.victimId } : {}),
    ...(params.caseId ? { caseId: params.caseId } : {}),
    ...(params.complaintId ? { complaintId: params.complaintId } : {}),
  };
}

const assessSchema = z.object({
  victimId: z.string().min(1),
  complaintId: z.string().optional(),
  caseId: z.string().optional(),
  narrative: z.string().min(1),
  languageHint: z.string().optional(),
  audioBase64: z.string().optional(),
});

assessmentsRouter.post('/', asyncHandler(async (req, res) => {
  const body = assessSchema.parse(req.body);

  const victim = await prisma.victim.findUnique({ where: { id: body.victimId } });
  if (!victim) throw new ApiError(404, 'not_found', 'Victim not found');
  await requireConsent(body.victimId, 'ai_assessment');

  let priorEscalations = 0;
  if (body.caseId) {
    priorEscalations = await prisma.caseTimeline.count({
      where: { caseId: body.caseId, eventType: 'status_change', summary: { contains: 'critical priority' } },
    });
  }

  const ai = await runAssessment({
    narrative: body.narrative,
    languageHint: body.languageHint,
    priorEscalations,
    audioBase64: body.audioBase64,
  });

  const assessment = await persistAssessment(prisma, {
    victimId: body.victimId,
    complaintId: body.complaintId,
    caseId: body.caseId,
    narrative: body.narrative,
    actorId: req.user!.sub.startsWith('emergency:') ? null : req.user!.sub,
  }, ai);

  await recordAudit({ req, action: 'CREATE', entityType: 'Assessment', entityId: assessment.id, meta: { sviBand: ai.svi.band } });

  broadcastCaseEvent(body.caseId ?? null, 'assessment:new', {
    assessmentId: assessment.id,
    victimId: body.victimId,
    caseId: body.caseId,
    svi: ai.svi,
  });

  if (body.caseId) {
    const victimProfile = await prisma.victimProfile.findUnique({ where: { victimId: body.victimId } });
    if (victimProfile) broadcastToVictim(victimProfile.userId, 'assessment:new', { assessmentId: assessment.id, svi: ai.svi });

    if (ai.svi.band === 'HIGH' || ai.svi.band === 'CRITICAL') {
      const assignments = await prisma.caseAssignment.findMany({ where: { caseId: body.caseId, active: true } });
      for (const a of assignments) {
        await notify({
          userId: a.userId,
          eventType: 'case_update',
          title: `${ai.svi.band} risk assessment`,
          body: `New AI assessment scored SVI ${ai.svi.value} (${ai.svi.band}) on a case you're assigned to.`,
        });
      }
    }
  }

  res.status(201).json({ assessmentId: assessment.id, ai });
}));

assessmentsRouter.get('/', asyncHandler(async (req, res) => {
  // complaintId was accepted by every caller (see app/src/lib/
  // useAssessmentSelector.js) but silently ignored here - a real bug: with
  // no filter applied at all, this returned the single most-recently-
  // created assessment SYSTEM-WIDE regardless of which complaint was
  // actually requested, so every "assessment for this complaint" page
  // (Victim Assessment, Voice Analysis, NLP Analysis, Explainable AI) could
  // show a completely unrelated complaint's stale result - looking exactly
  // like "the score never changes no matter what I submit."
  const where = buildAssessmentListWhere({
    victimId: qStr(req, 'victimId'),
    caseId: qStr(req, 'caseId'),
    complaintId: qStr(req, 'complaintId'),
  });
  const items = await prisma.assessment.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { sviScore: true, riskScore: true, emotionScore: true },
  });
  res.json(items);
}));

assessmentsRouter.get('/:id', asyncHandler(async (req, res) => {
  const assessment = await prisma.assessment.findUnique({
    where: { id: pStr(req, 'id') },
    include: {
      voiceRecording: true,
      emotionScore: true,
      traumaScore: true,
      fearScore: true,
      stressScore: true,
      isolationScore: true,
      threatIndicator: true,
      riskScore: true,
      sviScore: true,
      recommendations: true,
      explanations: true,
      aiOutputs: true,
      reviews: { orderBy: { createdAt: 'desc' }, include: { reviewer: { select: { fullName: true, designation: true } } } },
    },
  });
  if (!assessment) throw new ApiError(404, 'not_found', 'Assessment not found');
  res.json(assessment);
}));

// Real human-feedback / outcome-labeling: whether a staff member agreed
// with the AI's risk band, or overrode it with their own judgment. This is
// the honest mechanism for accumulating real labeled data from genuine
// field use over time - see AssessmentReview's schema comment for why this
// is the only real path to validating the scoring formulas, as opposed to
// the illustrative self-written evaluation harness in the AI service.
const reviewSchema = z.object({
  action: z.enum(['CONFIRMED', 'OVERRIDDEN']),
  overriddenBand: z.enum(['LOW', 'MODERATE', 'HIGH', 'CRITICAL']).optional(),
  note: z.string().max(2000).optional(),
});

assessmentsRouter.post(
  '/:id/review',
  requireRoles(
    RoleName.HELPLINE_OPERATOR, RoleName.COUNSELLOR, RoleName.POLICE_OFFICER, RoleName.DISTRICT_OFFICER,
    RoleName.LEGAL_OFFICER, RoleName.SOCIAL_JUSTICE_OFFICER, RoleName.ADMINISTRATOR, RoleName.STATE_ADMINISTRATOR,
    RoleName.MINISTRY_OFFICIAL,
  ),
  asyncHandler(async (req, res) => {
    const body = reviewSchema.parse(req.body);
    if (body.action === 'OVERRIDDEN' && !body.overriddenBand) {
      throw new ApiError(400, 'overridden_band_required', 'overriddenBand is required when overriding an assessment');
    }
    const assessment = await prisma.assessment.findUnique({ where: { id: pStr(req, 'id') } });
    if (!assessment) throw new ApiError(404, 'not_found', 'Assessment not found');

    const review = await prisma.assessmentReview.create({
      data: {
        assessmentId: assessment.id,
        reviewerId: req.user!.sub,
        action: body.action,
        overriddenBand: body.overriddenBand,
        note: body.note,
      },
      include: { reviewer: { select: { fullName: true, designation: true } } },
    });

    await recordAudit({ req, action: 'CREATE', entityType: 'AssessmentReview', entityId: review.id, meta: { assessmentId: assessment.id, action: body.action } });
    res.status(201).json(review);
  }),
);
