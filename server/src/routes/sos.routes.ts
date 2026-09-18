import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/error.js';
import { sosLimiter } from '../middleware/rateLimit.js';
import { pStr } from '../lib/query.js';
import { recordAudit } from '../services/audit.service.js';
import { broadcastCaseEvent, getIO } from '../services/socket.service.js';
import { notify } from '../services/notification.service.js';
import { RoleName } from '@prisma/client';

export const sosRouter = Router();
sosRouter.use(requireAuth);
sosRouter.use(sosLimiter);

const createSchema = z.object({
  victimId: z.string().optional(),
  complaintId: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  state: z.string().optional(),
  district: z.string().optional(),
  notes: z.string().optional(),
});

// Reachable by an emergency-bypass token (no victimId) as well as a full
// survivor session - this endpoint is the reason the emergency token exists
// at all, so it never gates on anything beyond a valid JWT.
sosRouter.post('/', asyncHandler(async (req, res) => {
  const body = createSchema.parse(req.body);
  const sos = await prisma.sOSRequest.create({ data: body });

  await recordAudit({ req, action: 'CREATE', entityType: 'SOSRequest', entityId: sos.id });

  // Fan out to every officer with an active district/state match (or every
  // helpline operator + district officer nationally if location is
  // unknown, e.g. the emergency-bypass flow) - a real deployment would add
  // an on-call rotation here, which is a policy change, not an architecture
  // change, to this notify() call.
  const where = body.district
    ? { OR: [{ district: body.district }, { role: { name: RoleName.HELPLINE_OPERATOR } }] }
    : { role: { name: { in: [RoleName.HELPLINE_OPERATOR, RoleName.DISTRICT_OFFICER] } } };
  const responders = await prisma.user.findMany({ where: { userType: 'GOVERNMENT', ...where }, take: 25 });
  for (const responder of responders) {
    await notify({ userId: responder.id, eventType: 'sos', title: 'SOS ALERT', body: `Emergency SOS received${body.district ? ` in ${body.district}` : ''}.` });
  }

  getIO()?.to('government').emit('sos:new', sos);
  res.status(201).json(sos);
}));

sosRouter.get(
  '/',
  requireRoles(
    RoleName.HELPLINE_OPERATOR, RoleName.DISTRICT_OFFICER, RoleName.POLICE_OFFICER,
    RoleName.ADMINISTRATOR, RoleName.STATE_ADMINISTRATOR,
  ),
  asyncHandler(async (req, res) => {
    const items = await prisma.sOSRequest.findMany({
      where: { status: { in: ['OPEN', 'ACKNOWLEDGED', 'DISPATCHED'] } },
      orderBy: { createdAt: 'desc' },
      include: { victim: false },
    });
    res.json(items);
  }),
);

const statusSchema = z.object({ status: z.enum(['OPEN', 'ACKNOWLEDGED', 'DISPATCHED', 'RESOLVED']) });

sosRouter.patch(
  '/:id/status',
  requireRoles(RoleName.HELPLINE_OPERATOR, RoleName.DISTRICT_OFFICER, RoleName.POLICE_OFFICER, RoleName.ADMINISTRATOR),
  asyncHandler(async (req, res) => {
    const body = statusSchema.parse(req.body);
    const existing = await prisma.sOSRequest.findUnique({ where: { id: pStr(req, 'id') } });
    if (!existing) throw new ApiError(404, 'not_found', 'SOS request not found');
    const sos = await prisma.sOSRequest.update({
      where: { id: existing.id },
      data: { status: body.status, resolvedAt: body.status === 'RESOLVED' ? new Date() : undefined },
    });
    await recordAudit({ req, action: 'UPDATE', entityType: 'SOSRequest', entityId: sos.id, meta: { status: body.status } });
    broadcastCaseEvent(null, 'sos:update', sos);
    res.json(sos);
  }),
);
