import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { requireAuth } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import * as authService from '../services/auth.service.js';
import { recordAudit } from '../services/audit.service.js';

export const authRouter = Router();
authRouter.use(authLimiter);

authRouter.post('/gov/email/login', asyncHandler(async (req, res) => {
  const body = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
  const result = await authService.govEmailLogin(body.email, body.password);
  await recordAudit({ userId: result.user.id, action: 'LOGIN', entityType: 'User', entityId: result.user.id, meta: { method: 'gov_email' } });
  res.json(result);
}));

authRouter.post('/gov/employee/login', asyncHandler(async (req, res) => {
  const body = z.object({ department: z.string().min(1), employeeId: z.string().min(1), password: z.string().min(1) }).parse(req.body);
  const result = await authService.govEmployeeLogin(body.department, body.employeeId, body.password);
  await recordAudit({ userId: result.user.id, action: 'LOGIN', entityType: 'User', entityId: result.user.id, meta: { method: 'gov_employee' } });
  res.json(result);
}));

authRouter.post('/survivor/mobile/send-otp', asyncHandler(async (req, res) => {
  const body = z.object({ mobileNumber: z.string() }).parse(req.body);
  res.json(await authService.sendMobileOtp(body.mobileNumber));
}));

authRouter.post('/survivor/mobile/verify-otp', asyncHandler(async (req, res) => {
  const body = z.object({ mobileNumber: z.string(), code: z.string() }).parse(req.body);
  const result = await authService.verifyMobileOtp(body.mobileNumber, body.code);
  await recordAudit({ userId: result.user.id, action: 'LOGIN', entityType: 'User', entityId: result.user.id, meta: { method: 'mobile_otp' } });
  res.json(result);
}));

authRouter.post('/survivor/case/send-otp', asyncHandler(async (req, res) => {
  const body = z.object({ caseId: z.string().min(1) }).parse(req.body);
  res.json(await authService.sendCaseOtp(body.caseId));
}));

authRouter.post('/survivor/case/verify-otp', asyncHandler(async (req, res) => {
  const body = z.object({ caseId: z.string().min(1), code: z.string() }).parse(req.body);
  const result = await authService.verifyCaseOtp(body.caseId, body.code);
  await recordAudit({ userId: result.user.id, action: 'LOGIN', entityType: 'User', entityId: result.user.id, meta: { method: 'case_id_otp' } });
  res.json(result);
}));

authRouter.post('/survivor/register', asyncHandler(async (req, res) => {
  const body = z.object({ name: z.string().min(1), mobileNumber: z.string(), language: z.string().default('English') }).parse(req.body);
  const result = await authService.registerSurvivor(body.name, body.mobileNumber, body.language);
  await recordAudit({ userId: result.user.id, action: 'CREATE', entityType: 'User', entityId: result.user.id, meta: { method: 'registration' } });
  res.status(201).json(result);
}));

authRouter.post('/survivor/emergency', asyncHandler(async (req, res) => {
  res.json(await authService.emergencyAccess());
}));

authRouter.get('/me', requireAuth, asyncHandler(async (req, res) => {
  if (req.user!.sub.startsWith('emergency:')) {
    return res.json({ id: req.user!.sub, userType: req.user!.userType, role: req.user!.role, emergency: true });
  }
  const user = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    include: { role: true, victimProfile: true },
  });
  if (!user) return res.status(404).json({ error: 'not_found' });
  res.json({
    id: user.id,
    fullName: user.fullName,
    role: user.role.name,
    userType: user.userType,
    email: user.email,
    designation: user.designation,
    district: user.district,
    state: user.state,
    victimId: user.victimProfile?.victimId ?? null,
  });
}));
