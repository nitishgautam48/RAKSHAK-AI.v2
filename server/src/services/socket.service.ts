import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import type { AuthTokenPayload } from '../middleware/auth.js';

let io: Server | undefined;

// Live (near-real-time, segmented) transcription proxy - see ai-service's
// app/engines/streaming_transcription.py module docstring for exactly what
// "near-real-time" honestly means and why. A browser WebSocket client
// cannot set arbitrary headers, so it cannot authenticate directly against
// ai-service's X-Service-Key-gated /v1/stream-transcribe endpoint the way a
// normal REST call does - instead, the browser streams audio over this
// already-JWT-authenticated Socket.IO connection, and THIS server (which
// can set arbitrary headers on an outbound connection, same as every other
// ai-service call in ai.service.ts) opens and owns the actual WebSocket to
// ai-service, proxying bytes and events in both directions. One ai-service
// connection per browser socket that has an active live-transcription
// session, torn down on transcribe:stop or on the browser socket
// disconnecting - never left open past its session.
function aiServiceStreamUrl(languageHint?: string): string {
  const wsBase = env.aiServiceUrl.replace(/^http/, 'ws');
  const url = new URL(`${wsBase}/v1/stream-transcribe`);
  if (languageHint) url.searchParams.set('language_hint', languageHint);
  return url.toString();
}

function closeUpstream(socket: Socket): void {
  const upstream = socket.data.transcribeSocket as WebSocket | undefined;
  if (!upstream) return;
  socket.data.transcribeSocket = undefined;
  if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) {
    upstream.close();
  }
}

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

    socket.on('transcribe:start', (opts: { languageHint?: string } = {}) => {
      // Guard against a client emitting start twice without an intervening
      // stop - close whatever's already open first rather than leaking a
      // second upstream connection.
      closeUpstream(socket);

      const upstream = new WebSocket(aiServiceStreamUrl(opts?.languageHint), {
        headers: { 'X-Service-Key': env.aiServiceKey },
      } as never); // Node's built-in WebSocket client accepts a headers option at runtime; the ws-standard lib.dom types don't model it, hence the cast rather than pulling in a separate client library.
      socket.data.transcribeSocket = upstream;

      upstream.addEventListener('open', () => {
        socket.emit('transcribe:ready');
      });
      upstream.addEventListener('message', (event) => {
        // ai-service sends JSON text frames ({"type": "partial"|"final"|"error", ...})
        try {
          const payload = JSON.parse(event.data.toString());
          socket.emit('transcribe:event', payload);
        } catch {
          // Malformed frame from ai-service - drop it rather than crash the
          // socket; the live session simply misses one update.
        }
      });
      upstream.addEventListener('error', () => {
        socket.emit('transcribe:event', { type: 'error', message: 'Lost connection to the AI service.' });
      });
      upstream.addEventListener('close', () => {
        if (socket.data.transcribeSocket === upstream) socket.data.transcribeSocket = undefined;
      });
    });

    socket.on('transcribe:audio', (chunk: ArrayBuffer | Buffer) => {
      const upstream = socket.data.transcribeSocket as WebSocket | undefined;
      if (!upstream || upstream.readyState !== WebSocket.OPEN) return;
      // Buffer (Node/Socket.IO's real runtime type for a binary payload) and
      // ArrayBuffer both work directly as WebSocket.send() payloads.
      upstream.send(chunk as never);
    });

    socket.on('transcribe:stop', () => {
      closeUpstream(socket);
    });

    socket.on('disconnect', () => {
      closeUpstream(socket);
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
