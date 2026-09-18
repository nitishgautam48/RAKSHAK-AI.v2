import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { parsePagination, paginated } from '../lib/pagination.js';
import { qStr } from '../lib/query.js';
import type { InterventionType } from '@prisma/client';

export const recommendationsRouter = Router();
recommendationsRouter.use(requireAuth);

recommendationsRouter.get('/', asyncHandler(async (req, res) => {
  const { page, pageSize, skip, take } = parsePagination(req);
  const type = qStr(req, 'type');
  const where = type ? { type: type as InterventionType } : {};

  const [items, total] = await Promise.all([
    prisma.recommendation.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        assessment: {
          include: {
            victim: { select: { displayCode: true, state: true, district: true } },
            complaint: { select: { code: true } },
            sviScore: { select: { band: true } },
          },
        },
        intervention: { select: { status: true } },
      },
    }),
    prisma.recommendation.count({ where }),
  ]);

  const dto = items.map((r) => ({
    id: r.id,
    type: r.type,
    priority: r.priority,
    confidence: r.confidence,
    rationale: r.rationale,
    createdAt: r.createdAt,
    interventionStatus: r.intervention?.status ?? null,
    victimCode: r.assessment.victim.displayCode,
    complaintCode: r.assessment.complaint?.code ?? null,
    state: r.assessment.victim.state,
    district: r.assessment.victim.district,
    riskBand: r.assessment.sviScore?.band ?? null,
  }));

  res.json(paginated(dto, total, page, pageSize));
}));
