import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';

export const analyticsRouter = Router();
analyticsRouter.use(requireAuth);

analyticsRouter.get('/overview', asyncHandler(async (_req, res) => {
  const [totalCases, activeCritical, resolved, sviAgg, confidenceAgg, escalationAgg, counsellingTotal, counsellingCompleted] = await Promise.all([
    prisma.case.count(),
    prisma.case.count({ where: { riskLevel: 'CRITICAL', status: { not: 'CLOSED' } } }),
    prisma.case.count({ where: { status: 'CLOSED' } }),
    prisma.sVIScore.aggregate({ _avg: { value: true } }),
    prisma.aIExplanation.aggregate({ _avg: { confidence: true } }),
    prisma.riskScore.aggregate({ _avg: { escalationProbability: true } }),
    prisma.counsellingSession.count(),
    prisma.counsellingSession.count({ where: { status: 'completed' } }),
  ]);

  res.json({
    totalCases,
    activeCriticalCases: activeCritical,
    averageSvi: Math.round((sviAgg._avg.value ?? 0) * 10) / 10,
    averageModelConfidence: Math.round((confidenceAgg._avg.confidence ?? 0) * 10) / 10,
    averageEscalationProbability: Math.round((escalationAgg._avg.escalationProbability ?? 0) * 10) / 10,
    casesResolved: resolved,
    counsellingCoveragePct: counsellingTotal > 0 ? Math.round((100 * counsellingCompleted) / counsellingTotal) : 0,
  });
}));

analyticsRouter.get('/risk-distribution', asyncHandler(async (_req, res) => {
  const rows = await prisma.case.groupBy({ by: ['riskLevel'], _count: { riskLevel: true } });
  const dist = { LOW: 0, MODERATE: 0, HIGH: 0, CRITICAL: 0 } as Record<string, number>;
  for (const r of rows) dist[r.riskLevel] = r._count.riskLevel;
  res.json(dist);
}));

analyticsRouter.get('/state-rankings', asyncHandler(async (_req, res) => {
  const victims = await prisma.victim.findMany({ select: { state: true, cases: { select: { riskLevel: true, status: true } } } });
  const byState = new Map<string, { state: string; activeCases: number; criticalCases: number }>();
  for (const v of victims) {
    const entry = byState.get(v.state) ?? { state: v.state, activeCases: 0, criticalCases: 0 };
    for (const c of v.cases) {
      if (c.status === 'CLOSED') continue;
      entry.activeCases += 1;
      if (c.riskLevel === 'CRITICAL') entry.criticalCases += 1;
    }
    byState.set(v.state, entry);
  }
  res.json(Array.from(byState.values()).sort((a, b) => b.activeCases - a.activeCases));
}));

analyticsRouter.get('/monthly-trend', asyncHandler(async (_req, res) => {
  const complaints = await prisma.complaint.findMany({ select: { createdAt: true } });
  const byMonth = new Map<string, number>();
  for (const c of complaints) {
    const key = `${c.createdAt.getFullYear()}-${String(c.createdAt.getMonth() + 1).padStart(2, '0')}`;
    byMonth.set(key, (byMonth.get(key) ?? 0) + 1);
  }
  res.json(Array.from(byMonth.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([month, count]) => ({ month, count })));
}));

function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

// Weekly average SVI over the last 12 ISO weeks that actually have scored
// assessments - real aggregation over SVIScore rows, not a fabricated curve.
analyticsRouter.get('/svi-trend', asyncHandler(async (_req, res) => {
  const scores = await prisma.sVIScore.findMany({ select: { value: true, createdAt: true }, orderBy: { createdAt: 'asc' } });
  const byWeek = new Map<string, { sum: number; count: number }>();
  for (const s of scores) {
    const key = isoWeekKey(s.createdAt);
    const entry = byWeek.get(key) ?? { sum: 0, count: 0 };
    entry.sum += s.value;
    entry.count += 1;
    byWeek.set(key, entry);
  }
  const weeks = Array.from(byWeek.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([week, { sum, count }]) => ({ week, avgSvi: Math.round((sum / count) * 10) / 10, assessmentCount: count }));
  res.json(weeks);
}));

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Complaint volume for each of the last 7 calendar days (real counts).
analyticsRouter.get('/weekly-activity', asyncHandler(async (_req, res) => {
  const since = new Date();
  since.setDate(since.getDate() - 6);
  since.setHours(0, 0, 0, 0);
  const complaints = await prisma.complaint.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } });

  const days: { label: string; date: string; count: number }[] = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    days.push({ label: WEEKDAY_LABELS[d.getDay()]!, date: d.toISOString().slice(0, 10), count: 0 });
  }
  for (const c of complaints) {
    const dateStr = c.createdAt.toISOString().slice(0, 10);
    const day = days.find((d) => d.date === dateStr);
    if (day) day.count += 1;
  }
  res.json(days);
}));

const RECOMMENDATION_LABELS: Record<string, string> = {
  COUNSELLING: 'Counselling',
  MEDICAL_AID: 'Medical Support',
  POLICE_PROTECTION: 'Police Protection',
  WITNESS_PROTECTION: 'Witness Protection',
  LEGAL_AID: 'Legal Aid',
  COMPENSATION_SUPPORT: 'Compensation Support',
  SHELTER_SUPPORT: 'Shelter Support',
  REHABILITATION_SUPPORT: 'Rehabilitation Support',
};

// Count of AI-generated recommendations by type across every assessment
// ever run - real counts from the Recommendation table.
analyticsRouter.get('/recommendations-overview', asyncHandler(async (_req, res) => {
  const rows = await prisma.recommendation.groupBy({ by: ['type'], _count: { type: true } });
  const result = rows
    .map((r) => ({ type: r.type, label: RECOMMENDATION_LABELS[r.type] ?? r.type, count: r._count.type }))
    .sort((a, b) => b.count - a.count);
  res.json(result);
}));

// Average SVI + case counts per district, from real SVIScore rows joined
// through Assessment -> Victim. Used by Risk Intelligence's district
// comparison and drives which districts are flagged as escalating.
analyticsRouter.get('/district-risk', asyncHandler(async (_req, res) => {
  const scores = await prisma.sVIScore.findMany({
    select: { value: true, assessment: { select: { victim: { select: { state: true, district: true } } } } },
  });
  const byDistrict = new Map<string, { state: string; district: string; sum: number; count: number }>();
  for (const s of scores) {
    const { state, district } = s.assessment.victim;
    const key = `${state}::${district}`;
    const entry = byDistrict.get(key) ?? { state, district, sum: 0, count: 0 };
    entry.sum += s.value;
    entry.count += 1;
    byDistrict.set(key, entry);
  }
  const result = Array.from(byDistrict.values())
    .map((d) => ({ state: d.state, district: d.district, avgSvi: Math.round((d.sum / d.count) * 10) / 10, assessmentCount: d.count }))
    .sort((a, b) => b.avgSvi - a.avgSvi);
  res.json(result);
}));

// Complaint volume by intake channel (helpline / portal / field-visit) -
// real counts from the Complaint table.
analyticsRouter.get('/channel-breakdown', asyncHandler(async (_req, res) => {
  const rows = await prisma.complaint.groupBy({ by: ['channel'], _count: { channel: true } });
  res.json(rows.map((r) => ({ channel: r.channel, count: r._count.channel })).sort((a, b) => b.count - a.count));
}));
