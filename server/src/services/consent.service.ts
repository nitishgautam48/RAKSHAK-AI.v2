import { prisma } from '../lib/prisma.js';
import { ApiError } from '../middleware/error.js';

export type ConsentScope = 'data_sharing' | 'ai_assessment' | 'video_recording' | 'research';

// Consent is its own authorization layer, deliberately separate from RBAC:
// an officer can be *permitted* by role to request an AI assessment and
// still be *blocked* if the victim hasn't consented to it. Both checks must
// pass independently - this mirrors the FastAPI backend's original consent
// design (see ai-service's predecessor, app/consent.py before the Node
// migration), ported here since Node now owns the database.
export async function requireConsent(victimId: string, scope: ConsentScope): Promise<void> {
  const latest = await prisma.consentRecord.findFirst({
    where: { victimId, scope },
    orderBy: { recordedAt: 'desc' },
  });
  const valid = latest && latest.granted && (!latest.expiresAt || latest.expiresAt > new Date());
  if (!valid) {
    throw new ApiError(
      428,
      'consent_required',
      `Consent for scope "${scope}" has not been recorded for this victim. Record consent via POST /api/consent before proceeding.`,
    );
  }
}

export async function recordConsent(params: { victimId: string; userId?: string; scope: ConsentScope; granted: boolean; expiresAt?: Date }) {
  return prisma.consentRecord.create({
    data: {
      victimId: params.victimId,
      userId: params.userId,
      scope: params.scope,
      granted: params.granted,
      expiresAt: params.expiresAt,
    },
  });
}
