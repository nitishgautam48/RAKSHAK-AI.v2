import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import { asyncHandler, ApiError } from '../middleware/error.js';
import { qStr, pStr } from '../lib/query.js';
import { storage } from '../services/storage.service.js';
import { recordAudit } from '../services/audit.service.js';
import { broadcastCaseEvent } from '../services/socket.service.js';
import type { DocumentType } from '@prisma/client';

export const documentsRouter = Router();
documentsRouter.use(requireAuth);

documentsRouter.get('/', asyncHandler(async (req, res) => {
  // A survivor can only ever list their own documents - their own victimId
  // (from the JWT) always wins over anything supplied in the query, so one
  // survivor account can't enumerate another victim's documents.
  const victimId = req.user?.victimId ?? qStr(req, 'victimId');
  const complaintId = qStr(req, 'complaintId');
  const items = await prisma.document.findMany({
    where: { ...(victimId ? { victimId } : {}), ...(complaintId ? { complaintId } : {}) },
    orderBy: { createdAt: 'desc' },
    include: { versions: true, uploadedBy: { select: { fullName: true } } },
  });
  res.json(items);
}));

const uploadMetaSchema = z.object({
  type: z.enum(['COMPLAINT_COPY', 'FIR', 'MEDICAL_REPORT', 'IDENTITY_PROOF', 'EVIDENCE_PHOTO', 'COURT_ORDER', 'STATEMENT', 'OTHER']),
  title: z.string().min(1),
  victimId: z.string().optional(),
  complaintId: z.string().optional(),
});

documentsRouter.post('/', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'file_required', 'A file is required');
  const body = uploadMetaSchema.parse(req.body);

  // Same rule as the list endpoint: a survivor can only ever attach
  // documents to their own victim record, never one supplied by the client.
  const victimId = req.user?.victimId ?? body.victimId;

  const storageKey = await storage.save(req.file.buffer, { subdir: 'documents', filename: req.file.originalname });
  const doc = await prisma.document.create({
    data: {
      type: body.type as DocumentType,
      title: body.title,
      victimId,
      complaintId: body.complaintId,
      storageKey,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      uploadedById: req.user!.sub.startsWith('emergency:') ? null : req.user!.sub,
      versions: { create: { versionNo: 1, storageKey } },
    },
  });

  await recordAudit({ req, action: 'CREATE', entityType: 'Document', entityId: doc.id });
  if (body.complaintId) {
    const complaint = await prisma.complaint.findUnique({ where: { id: body.complaintId } });
    if (complaint) {
      const kase = await prisma.case.findUnique({ where: { complaintId: body.complaintId } });
      if (kase) {
        await prisma.caseTimeline.create({ data: { caseId: kase.id, eventType: 'document', summary: `Document uploaded: ${body.title}` } });
        broadcastCaseEvent(kase.id, 'document:new', doc);
      }
    }
  }
  res.status(201).json(doc);
}));

documentsRouter.get('/:id/file', asyncHandler(async (req, res) => {
  const doc = await prisma.document.findUnique({ where: { id: pStr(req, 'id') } });
  if (!doc) throw new ApiError(404, 'not_found', 'Document not found');
  if (req.user?.victimId && doc.victimId !== req.user.victimId) {
    throw new ApiError(403, 'forbidden', 'You do not have access to this document.');
  }
  const buffer = await storage.read(doc.storageKey);
  await recordAudit({ req, action: 'READ', entityType: 'Document', entityId: doc.id });
  res.setHeader('Content-Type', doc.mimeType);
  res.send(buffer);
}));

documentsRouter.post('/:id/versions', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'file_required', 'A file is required');
  const doc = await prisma.document.findUnique({ where: { id: pStr(req, 'id') }, include: { versions: true } });
  if (!doc) throw new ApiError(404, 'not_found', 'Document not found');

  const storageKey = await storage.save(req.file.buffer, { subdir: 'documents', filename: req.file.originalname });
  const nextVersion = doc.versions.length + 1;
  const version = await prisma.documentVersion.create({
    data: { documentId: doc.id, versionNo: nextVersion, storageKey, note: qStr(req, 'note') },
  });
  await prisma.document.update({ where: { id: doc.id }, data: { storageKey } });
  await recordAudit({ req, action: 'UPDATE', entityType: 'Document', entityId: doc.id, meta: { newVersion: nextVersion } });
  res.status(201).json(version);
}));
