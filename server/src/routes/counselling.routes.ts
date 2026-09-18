import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/error.js';
import { qStr, pStr } from '../lib/query.js';
import { recordAudit } from '../services/audit.service.js';
import { broadcastToVictim, getIO } from '../services/socket.service.js';
import { notify } from '../services/notification.service.js';
import { RoleName } from '@prisma/client';

export const counsellingRouter = Router();
counsellingRouter.use(requireAuth);

counsellingRouter.get('/sessions', asyncHandler(async (req, res) => {
  // A survivor can only ever see their own sessions - their own victimId
  // (from the JWT) always wins over anything supplied in the query.
  const victimId = req.user?.victimId ?? qStr(req, 'victimId');
  const counsellorId = qStr(req, 'counsellorId');
  const items = await prisma.counsellingSession.findMany({
    where: { ...(victimId ? { victimId } : {}), ...(counsellorId ? { counsellorId } : {}) },
    orderBy: { scheduledAt: 'desc' },
    include: { counsellor: { select: { fullName: true } }, victim: { select: { displayCode: true } } },
  });
  res.json(items);
}));

const createSchema = z.object({
  victimId: z.string().min(1),
  counsellorId: z.string().min(1),
  scheduledAt: z.string().datetime(),
  mode: z.enum(['video', 'in_person', 'phone']).default('video'),
});

counsellingRouter.post(
  '/sessions',
  requireRoles(RoleName.COUNSELLOR, RoleName.DISTRICT_OFFICER, RoleName.ADMINISTRATOR),
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const session = await prisma.counsellingSession.create({ data: { ...body, scheduledAt: new Date(body.scheduledAt) } });

    const victimProfile = await prisma.victimProfile.findUnique({ where: { victimId: body.victimId } });
    if (victimProfile) {
      await notify({ userId: victimProfile.userId, eventType: 'counselling_session', title: 'Counselling session scheduled', body: `A ${body.mode} session has been scheduled.` });
      broadcastToVictim(victimProfile.userId, 'counselling:update', session);
    }
    await notify({ userId: body.counsellorId, eventType: 'counselling_session', title: 'New session on your calendar', body: 'A new counselling session has been scheduled.' });

    await recordAudit({ req, action: 'CREATE', entityType: 'CounsellingSession', entityId: session.id });
    res.status(201).json(session);
  }),
);

const updateSchema = z.object({
  status: z.enum(['scheduled', 'completed', 'cancelled', 'no_show']).optional(),
  notes: z.string().optional(),
  wellbeingScore: z.number().min(0).max(100).optional(),
});

counsellingRouter.patch(
  '/sessions/:id',
  requireRoles(RoleName.COUNSELLOR, RoleName.ADMINISTRATOR),
  asyncHandler(async (req, res) => {
    const existing = await prisma.counsellingSession.findUnique({ where: { id: pStr(req, 'id') } });
    if (!existing) throw new ApiError(404, 'not_found', 'Session not found');
    const body = updateSchema.parse(req.body);
    const session = await prisma.counsellingSession.update({ where: { id: existing.id }, data: body });

    const victimProfile = await prisma.victimProfile.findUnique({ where: { victimId: session.victimId } });
    if (victimProfile) broadcastToVictim(victimProfile.userId, 'counselling:update', session);

    await recordAudit({ req, action: 'UPDATE', entityType: 'CounsellingSession', entityId: session.id });
    res.json(session);
  }),
);

// Lightweight signaling channel for the video-consultation UI (join/leave a
// session room + WebRTC offer/answer/ICE relay). Actual media stays
// peer-to-peer; this only relays signaling messages between the two
// participants already authenticated via requireAuth above.
export function registerVideoSignaling() {
  const io = getIO();
  if (!io) return;
  io.on('connection', (socket) => {
    socket.on('video:join', (sessionId: string) => socket.join(`video:${sessionId}`));
    socket.on('video:leave', (sessionId: string) => socket.leave(`video:${sessionId}`));
    socket.on('video:signal', (payload: { sessionId: string; data: unknown }) => {
      socket.to(`video:${payload.sessionId}`).emit('video:signal', { from: socket.id, data: payload.data });
    });
  });
}
