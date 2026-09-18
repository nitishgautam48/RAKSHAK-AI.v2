import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { getMlopsRegistry, getMlopsEval, getMlopsVoiceEval, getMlopsDrift } from '../services/ai.service.js';

export const aiMonitoringRouter = Router();
aiMonitoringRouter.use(requireAuth);

aiMonitoringRouter.get('/registry', asyncHandler(async (_req, res) => res.json(await getMlopsRegistry())));
aiMonitoringRouter.get('/eval', asyncHandler(async (_req, res) => res.json(await getMlopsEval())));
aiMonitoringRouter.get('/voice-eval', asyncHandler(async (_req, res) => res.json(await getMlopsVoiceEval())));
aiMonitoringRouter.get('/drift', asyncHandler(async (_req, res) => res.json(await getMlopsDrift())));

// The real validation metric: what fraction of AI assessments that staff
// actually reviewed did they confirm vs. override? Unlike the illustrative
// eval harness above (self-written, self-graded), this is genuine field
// agreement data accumulated from real human judgment via
// POST /api/assessments/:id/review - it starts empty and only grows as the
// system is actually used, which is the honest state to show rather than a
// fabricated number.
aiMonitoringRouter.get('/agreement-stats', asyncHandler(async (_req, res) => {
  const [total, confirmed, overridden, recentOverrides] = await Promise.all([
    prisma.assessmentReview.count(),
    prisma.assessmentReview.count({ where: { action: 'CONFIRMED' } }),
    prisma.assessmentReview.count({ where: { action: 'OVERRIDDEN' } }),
    prisma.assessmentReview.findMany({
      where: { action: 'OVERRIDDEN' },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { reviewer: { select: { fullName: true } }, assessment: { include: { sviScore: true } } },
    }),
  ]);
  res.json({
    totalReviews: total,
    confirmed,
    overridden,
    agreementRatePct: total > 0 ? Math.round((100 * confirmed) / total) : null,
    recentOverrides: recentOverrides.map((r) => ({
      id: r.id,
      reviewerName: r.reviewer.fullName,
      originalBand: r.assessment.sviScore?.band ?? null,
      overriddenBand: r.overriddenBand,
      note: r.note,
      createdAt: r.createdAt,
    })),
  });
}));
