import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { RETENTION_DAYS } from '../services/retention.service.js';
import { STATES, DISTRICTS_BY_STATE, SUB_DISTRICTS } from '../data/indiaGeography.js';

export const metaRouter = Router();
metaRouter.use(requireAuth);

// Real pan-India state/district/sub-district reference data (see
// data/indiaGeography.ts for sourcing notes and honesty caveats). Any
// authenticated user (government or survivor) can read this - it backs
// location pickers on both portals.
metaRouter.get('/geography', asyncHandler(async (_req, res) => {
  res.json({ states: STATES, districtsByState: DISTRICTS_BY_STATE, subDistricts: SUB_DISTRICTS });
}));

// Publicly-known policy figures (not sensitive) - safe for any logged-in
// government user to see, unlike the actual sweep trigger which is
// admin-gated in admin.routes.ts.
metaRouter.get('/retention-policy', asyncHandler(async (_req, res) => {
  res.json(RETENTION_DAYS);
}));

// Aggregate counts only (no raw entries, no PII) - safe for any role, so
// the Privacy & Ethics Center can show real audit activity without
// granting the full admin audit-log read.
metaRouter.get('/audit-summary', asyncHandler(async (_req, res) => {
  const [total, rows] = await Promise.all([
    prisma.auditLog.count(),
    prisma.auditLog.groupBy({ by: ['action'], _count: { action: true } }),
  ]);
  res.json({ total, byAction: rows.map((r) => ({ action: r.action, count: r._count.action })) });
}));
