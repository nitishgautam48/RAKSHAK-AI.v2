import { prisma } from '../lib/prisma.js';
import { RoleName } from '@prisma/client';

const ROLE_LABELS: Record<RoleName, string> = {
  VICTIM: 'Victim',
  SURVIVOR: 'Survivor',
  FAMILY_MEMBER: 'Family Member',
  HELPLINE_OPERATOR: 'Helpline Operator',
  COUNSELLOR: 'Counsellor',
  POLICE_OFFICER: 'Police Officer',
  DISTRICT_OFFICER: 'District Officer',
  LEGAL_OFFICER: 'Legal Officer',
  SOCIAL_JUSTICE_OFFICER: 'Social Justice Officer',
  ADMINISTRATOR: 'Administrator',
  STATE_ADMINISTRATOR: 'State Administrator',
  MINISTRY_OFFICIAL: 'Ministry Official',
};

// Idempotent role bootstrap so auth works from a fresh DB even before the
// full seed script runs. Safe to call on every server start.
export async function ensureRoles() {
  for (const name of Object.values(RoleName)) {
    await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name, description: ROLE_LABELS[name] },
    });
  }
}
