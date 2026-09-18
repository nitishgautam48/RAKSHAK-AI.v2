import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { RoleName, UserType } from '@prisma/client';

export interface AuthTokenPayload {
  sub: string; // user id
  role: RoleName;
  userType: UserType;
  victimId?: string; // present for SURVIVOR users, links to their Victim record
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}

export function signAccessToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'] });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'missing_token', message: 'Authorization header required' });
  }
  const token = header.slice('Bearer '.length);
  try {
    req.user = jwt.verify(token, env.jwtSecret) as AuthTokenPayload;
    next();
  } catch {
    return res.status(401).json({ error: 'invalid_token', message: 'Token is invalid or expired' });
  }
}

export function requireRoles(...roles: RoleName[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'unauthorized' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'forbidden', message: `Requires one of: ${roles.join(', ')}` });
    }
    next();
  };
}

export function requireUserType(...types: UserType[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'unauthorized' });
    if (!types.includes(req.user.userType)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    next();
  };
}
