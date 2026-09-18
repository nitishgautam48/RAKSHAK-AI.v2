import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { parsePagination, paginated } from '../lib/pagination.js';
import { qStr, pStr } from '../lib/query.js';
import { victimToDto } from '../lib/dto.js';
import { encryptField } from '../services/encryption.service.js';
import { genVictimDisplayCode } from '../lib/codes.js';
import { recordAudit } from '../services/audit.service.js';

export const victimsRouter = Router();
victimsRouter.use(requireAuth);

victimsRouter.get('/', asyncHandler(async (req, res) => {
  const { page, pageSize, skip, take } = parsePagination(req);
  const state = qStr(req, 'state');
  const district = qStr(req, 'district');
  const search = qStr(req, 'search');

  const where = {
    ...(state && state !== 'All States' ? { state } : {}),
    ...(district && district !== 'All Districts' ? { district } : {}),
    ...(search ? { OR: [{ displayCode: { contains: search } }] } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.victim.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
    prisma.victim.count({ where }),
  ]);

  await recordAudit({ req, action: 'READ', entityType: 'Victim', meta: { count: items.length } });
  res.json(paginated(items.map((v) => victimToDto(v)), total, page, pageSize));
}));

victimsRouter.get('/:id', asyncHandler(async (req, res) => {
  const victim = await prisma.victim.findUnique({ where: { id: pStr(req, 'id') } });
  if (!victim) return res.status(404).json({ error: 'not_found' });
  await recordAudit({ req, action: 'READ', entityType: 'Victim', entityId: victim.id });
  res.json(victimToDto(victim));
}));

const createVictimSchema = z.object({
  fullName: z.string().min(1),
  age: z.number().int().positive().optional(),
  gender: z.enum(['FEMALE', 'MALE', 'OTHER', 'UNDISCLOSED']).optional(),
  community: z.string().optional(),
  state: z.string().min(1),
  district: z.string().min(1),
  subDistrict: z.string().optional(),
  village: z.string().optional(),
  language: z.string().default('English'),
  contact: z.string().optional(),
  address: z.string().optional(),
});

victimsRouter.post('/', asyncHandler(async (req, res) => {
  const body = createVictimSchema.parse(req.body);
  const victim = await prisma.victim.create({
    data: {
      displayCode: genVictimDisplayCode(),
      fullNameEnc: encryptField(body.fullName),
      age: body.age,
      gender: body.gender,
      community: body.community,
      state: body.state,
      district: body.district,
      subDistrict: body.subDistrict,
      village: body.village,
      languagePref: body.language,
      contactEnc: body.contact ? encryptField(body.contact) : undefined,
      addressEnc: body.address ? encryptField(body.address) : undefined,
    },
  });
  await recordAudit({ req, action: 'CREATE', entityType: 'Victim', entityId: victim.id });
  res.status(201).json(victimToDto(victim));
}));
