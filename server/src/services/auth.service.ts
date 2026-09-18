import crypto from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { genOtp, genVictimDisplayCode } from '../lib/codes.js';
import { deliverOtp } from './notification.service.js';
import { encryptField } from './encryption.service.js';
import { signAccessToken } from '../middleware/auth.js';
import { ApiError } from '../middleware/error.js';
import { RoleName, UserType } from '@prisma/client';

const OTP_TTL_MS = 5 * 60 * 1000;

function isGovEmailDomain(email: string): boolean {
  const lower = email.toLowerCase();
  return env.govEmailDomains.some((d) => lower.endsWith(d.toLowerCase()));
}

async function issueSessionFor(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { role: true, victimProfile: true },
  });
  const token = signAccessToken({
    sub: user.id,
    role: user.role.name,
    userType: user.userType,
    victimId: user.victimProfile?.victimId,
  });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return {
    token,
    user: {
      id: user.id,
      fullName: user.fullName,
      role: user.role.name,
      userType: user.userType,
      email: user.email,
      designation: user.designation,
      district: user.district,
      state: user.state,
      victimId: user.victimProfile?.victimId ?? null,
    },
  };
}

// --- Government: email login -----------------------------------------------

export async function govEmailLogin(email: string, password: string) {
  if (!isGovEmailDomain(email)) {
    throw new ApiError(403, 'domain_not_allowed', 'Only .gov.in, .nic.in and police.gov.in domains are accepted.');
  }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash || user.userType !== 'GOVERNMENT') {
    throw new ApiError(401, 'invalid_credentials', 'Invalid email or password.');
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) throw new ApiError(401, 'invalid_credentials', 'Invalid email or password.');
  return issueSessionFor(user.id);
}

// --- Government: employee ID login -----------------------------------------

export async function govEmployeeLogin(_department: string, employeeId: string, password: string) {
  const user = await prisma.user.findUnique({ where: { employeeId } });
  if (!user || !user.passwordHash || user.userType !== 'GOVERNMENT') {
    throw new ApiError(401, 'invalid_credentials', 'Invalid employee ID or password.');
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) throw new ApiError(401, 'invalid_credentials', 'Invalid department, employee ID or password.');
  return issueSessionFor(user.id);
}

// --- Survivor: mobile OTP ----------------------------------------------------

export async function sendMobileOtp(mobileNumber: string) {
  if (!/^\d{10}$/.test(mobileNumber)) throw new ApiError(400, 'invalid_mobile', 'Enter a valid 10-digit mobile number.');
  const code = genOtp();
  const codeHash = crypto.createHash('sha256').update(code).digest('hex');
  await prisma.otpChallenge.create({
    data: { target: mobileNumber, channel: 'mobile', codeHash, expiresAt: new Date(Date.now() + OTP_TTL_MS) },
  });
  await deliverOtp(mobileNumber, code);
  return { sent: true, devCode: env.otpDevMode ? code : undefined };
}

export async function verifyMobileOtp(mobileNumber: string, code: string) {
  const challenge = await consumeOtp(mobileNumber, 'mobile', code);
  void challenge;
  let user = await prisma.user.findUnique({ where: { mobileNumber } });
  if (!user) {
    throw new ApiError(404, 'no_account', 'No account found for this mobile number. Please register first.');
  }
  return issueSessionFor(user.id);
}

async function consumeOtp(target: string, channel: string, code: string) {
  const codeHash = crypto.createHash('sha256').update(code).digest('hex');
  const challenge = await prisma.otpChallenge.findFirst({
    where: { target, channel, consumed: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!challenge || challenge.codeHash !== codeHash) {
    throw new ApiError(401, 'invalid_otp', 'The OTP is invalid or has expired.');
  }
  await prisma.otpChallenge.update({ where: { id: challenge.id }, data: { consumed: true } });
  return challenge;
}

// --- Survivor: Case ID + OTP -------------------------------------------------

export async function sendCaseOtp(caseId: string) {
  const complaint = await prisma.complaint.findUnique({ where: { code: caseId }, include: { victim: { include: { profile: true } } } });
  if (!complaint) throw new ApiError(404, 'case_not_found', 'No case found for this Case ID.');
  const code = genOtp();
  const codeHash = crypto.createHash('sha256').update(code).digest('hex');
  await prisma.otpChallenge.create({
    data: { target: caseId, channel: 'case_id', codeHash, expiresAt: new Date(Date.now() + OTP_TTL_MS) },
  });
  await deliverOtp(`case:${caseId}`, code);
  return { sent: true, devCode: env.otpDevMode ? code : undefined };
}

export async function verifyCaseOtp(caseId: string, code: string) {
  await consumeOtp(caseId, 'case_id', code);
  const complaint = await prisma.complaint.findUnique({
    where: { code: caseId },
    include: { victim: { include: { profile: { include: { user: true } } } } },
  });
  if (!complaint) throw new ApiError(404, 'case_not_found', 'No case found for this Case ID.');

  if (complaint.victim.profile?.user) {
    return issueSessionFor(complaint.victim.profile.user.id);
  }

  // First-time portal access for a complaint filed via helpline/field visit:
  // provision a survivor account and link it to the existing Victim record
  // so government-side history is preserved and immediately visible.
  const role = await prisma.role.findUniqueOrThrow({ where: { name: RoleName.SURVIVOR } });
  const user = await prisma.user.create({
    data: {
      userType: UserType.SURVIVOR,
      roleId: role.id,
      fullName: 'Survivor',
      victimProfile: {
        create: { victimId: complaint.victimId, statusLabel: 'Case is being actively handled' },
      },
    },
  });
  return issueSessionFor(user.id);
}

// --- Survivor: registration ---------------------------------------------------

export async function registerSurvivor(name: string, mobileNumber: string, language: string) {
  if (!/^\d{10}$/.test(mobileNumber)) throw new ApiError(400, 'invalid_mobile', 'Enter a valid 10-digit mobile number.');
  const existing = await prisma.user.findUnique({ where: { mobileNumber } });
  if (existing) throw new ApiError(409, 'already_registered', 'An account already exists for this mobile number.');

  const role = await prisma.role.findUniqueOrThrow({ where: { name: RoleName.SURVIVOR } });
  const victim = await prisma.victim.create({
    data: {
      displayCode: genVictimDisplayCode(),
      fullNameEnc: encryptField(name),
      state: 'Unspecified',
      district: 'Unspecified',
      languagePref: language,
      contactEnc: encryptField(mobileNumber),
    },
  });
  const user = await prisma.user.create({
    data: {
      userType: UserType.SURVIVOR,
      roleId: role.id,
      fullName: name,
      mobileNumber,
      victimProfile: { create: { victimId: victim.id, statusLabel: 'Registered — awaiting first assessment' } },
    },
  });
  await prisma.consentRecord.create({ data: { victimId: victim.id, userId: user.id, scope: 'data_sharing', granted: true } });
  await prisma.consentRecord.create({ data: { victimId: victim.id, userId: user.id, scope: 'ai_assessment', granted: true } });
  return issueSessionFor(user.id);
}

// --- Emergency access ---------------------------------------------------------

// Emergency bypass: issues a short-lived, narrowly-scoped token (no victimId,
// role VICTIM) that only the SOS and public support-directory endpoints
// accept, for someone who needs help *right now* and cannot complete OTP.
export async function emergencyAccess() {
  const role = await prisma.role.findUniqueOrThrow({ where: { name: RoleName.VICTIM } });
  const token = signAccessToken({ sub: `emergency:${crypto.randomUUID()}`, role: role.name, userType: UserType.SURVIVOR });
  return { token };
}
