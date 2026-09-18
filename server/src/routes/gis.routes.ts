import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { qStr } from '../lib/query.js';

export const gisRouter = Router();
gisRouter.use(requireAuth);

// Heatmap is computed live from real Case rows rather than the static
// GISData seed table, so it reflects every assessment/case update
// immediately - the seed table exists as an initial baseline/fallback only.
gisRouter.get('/heatmap', asyncHandler(async (req, res) => {
  const state = qStr(req, 'state');
  const grouped = await prisma.victim.findMany({
    where: state ? { state } : {},
    select: { state: true, district: true, cases: { select: { riskLevel: true, status: true } } },
  });

  const byRegion = new Map<string, { state: string; district: string; activeCases: number; critical: number; high: number; moderate: number; low: number }>();
  for (const v of grouped) {
    const key = `${v.state}::${v.district}`;
    const entry = byRegion.get(key) ?? { state: v.state, district: v.district, activeCases: 0, critical: 0, high: 0, moderate: 0, low: 0 };
    for (const c of v.cases) {
      if (c.status === 'CLOSED') continue;
      entry.activeCases += 1;
      if (c.riskLevel === 'CRITICAL') entry.critical += 1;
      else if (c.riskLevel === 'HIGH') entry.high += 1;
      else if (c.riskLevel === 'MODERATE') entry.moderate += 1;
      else entry.low += 1;
    }
    byRegion.set(key, entry);
  }

  res.json(Array.from(byRegion.values()).sort((a, b) => b.activeCases - a.activeCases));
}));

gisRouter.get('/support-centers', asyncHandler(async (req, res) => {
  const state = qStr(req, 'state');
  const district = qStr(req, 'district');
  const type = qStr(req, 'type');
  const centers = await prisma.supportCenter.findMany({
    where: { ...(state ? { state } : {}), ...(district ? { district } : {}), ...(type ? { type } : {}) },
  });
  res.json(centers);
}));
