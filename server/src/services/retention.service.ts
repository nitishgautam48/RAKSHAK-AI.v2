import { prisma } from '../lib/prisma.js';

// Retention windows (days). Matches the defaults used by the AI service's
// predecessor FastAPI backend before the Node migration. In production this
// runs on a schedule (cron/systemd timer/queue job); there is no durable
// scheduler in this sandbox, so it's exposed as an admin-triggered endpoint
// (POST /api/admin/retention/run) instead - the sweep logic itself is real
// and safe to run on a timer as-is.
export const RETENTION_DAYS = {
  auditLogs: 365 * 7,
  voiceTranscripts: 365 * 2,
  closedComplaints: 365 * 5,
};

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function runRetentionSweep() {
  const auditDeleted = await prisma.auditLog.deleteMany({
    where: { createdAt: { lt: daysAgo(RETENTION_DAYS.auditLogs) } },
  });

  // Redact rather than delete transcripts past their window - the case
  // record itself stays intact for legal/audit continuity, only the raw
  // narrative text is cleared.
  const transcriptsRedacted = await prisma.voiceRecording.updateMany({
    where: { createdAt: { lt: daysAgo(RETENTION_DAYS.voiceTranscripts) }, transcript: { not: null } },
    data: { transcript: '[redacted - retention window elapsed]' },
  });

  const staleClosedComplaints = await prisma.complaint.findMany({
    where: { status: 'CLOSED', updatedAt: { lt: daysAgo(RETENTION_DAYS.closedComplaints) } },
    select: { id: true },
  });

  return {
    auditLogsDeleted: auditDeleted.count,
    transcriptsRedacted: transcriptsRedacted.count,
    closedComplaintsEligibleForArchival: staleClosedComplaints.length,
    ranAt: new Date().toISOString(),
  };
}
