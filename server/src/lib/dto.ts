import { decryptField, maskContact } from '../services/encryption.service.js';
import type { Victim } from '@prisma/client';

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
