import { prisma } from '../lib/prisma.js';
import type { Request } from 'express';

export type AuditAction = 'READ' | 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'EXPORT';

export async function recordAudit(params: {
  req?: Request;
  userId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  meta?: Record<string, unknown>;
}) {
  // The emergency-bypass token (see authService.emergencyAccess) signs a
  // synthetic "emergency:<uuid>" subject with no backing User row - foreign
  // keying it into audit_log would fail every audited action taken by an
  // unauthenticated SOS caller, so it's logged as anonymous instead.
  const rawUserId = params.userId ?? params.req?.user?.sub ?? null;
  const userId = rawUserId?.startsWith('emergency:') ? null : rawUserId;

  await prisma.auditLog.create({
    data: {
      userId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      metaJson: params.meta ? JSON.stringify(params.meta) : null,
      ipAddress: params.req?.ip ?? null,
    },
  });
}
