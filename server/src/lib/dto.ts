import { decryptField, maskContact } from '../services/encryption.service.js';
import type { Victim } from '@prisma/client';

// Prisma `select` shape for the assigned-staff `user` relation on
// CaseAssignment. Routes were doing `include: { user: true }`, which
// serializes the FULL User row - including passwordHash - straight into
// the JSON response. That leaked every assigned officer/counsellor's
// bcrypt hash to anyone who could view the case, including the survivor
// themselves via GET /api/cases/mine. Use this select everywhere an
// assignment's user is included instead of `true`.
export const assignmentUserSelect = {
  id: true,
  fullName: true,
  role: { select: { name: true } },
  department: true,
  designation: true,
  mobileNumber: true,
  email: true,
} as const;

// Government roles with case-management responsibility see the decrypted
// name; anyone else (analytics/reporting contexts) gets the display code
// only. This mirrors the FastAPI backend's consent-gated PII access pattern.
export function victimToDto(v: Victim, opts: { revealPII: boolean } = { revealPII: true }) {
  return {
    id: v.id,
    displayCode: v.displayCode,
    name: opts.revealPII ? decryptField(v.fullNameEnc) : v.displayCode,
    age: v.age,
    gender: v.gender,
    community: v.community,
    state: v.state,
    district: v.district,
    subDistrict: v.subDistrict,
    village: v.village,
    language: v.languagePref,
    contact: opts.revealPII && v.contactEnc ? maskContact(decryptField(v.contactEnc)) : undefined,
    createdAt: v.createdAt,
  };
}
