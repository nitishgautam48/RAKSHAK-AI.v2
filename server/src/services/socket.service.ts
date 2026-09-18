import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import type { AuthTokenPayload } from '../middleware/auth.js';

let io: Server | undefined;

export function initSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: { origin: env.corsOrigins, credentials: true },
  });

  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('unauthorized'));
    try {
      const payload = jwt.verify(token, env.jwtSecret) as AuthTokenPayload;
      socket.data.user = payload;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user as AuthTokenPayload;
    socket.join(`user:${user.sub}`);
    socket.join(`role:${user.role}`);
    if (user.userType === 'GOVERNMENT') socket.join('government');
    if (user.userType === 'SURVIVOR') socket.join('survivor');
    logger.debug('socket connected', { userId: user.sub, role: user.role });

    socket.on('case:subscribe', (caseId: string) => {
      if (typeof caseId === 'string') socket.join(`case:${caseId}`);
    });
    socket.on('case:unsubscribe', (caseId: string) => {
      if (typeof caseId === 'string') socket.leave(`case:${caseId}`);
    });

    socket.on('disconnect', () => {
      logger.debug('socket disconnected', { userId: user.sub });
    });
  });

  return io;
}

export function getIO(): Server | undefined {
  return io;
}

// Broadcast a domain event both to everyone watching a specific case
// (government officers + the survivor's own room) and to the shared
// "government" room for dashboard-level live feeds. This is the mechanism
// that keeps the Gov Portal and Survivor Portal synchronized in real time.
export function broadcastCaseEvent(caseId: string | null, event: string, payload: unknown) {
  if (!io) return;
  if (caseId) io.to(`case:${caseId}`).emit(event, payload);
  io.to('government').emit(event, payload);
}

export function broadcastToVictim(victimUserId: string, event: string, payload: unknown) {
  io?.to(`user:${victimUserId}`).emit(event, payload);
}
