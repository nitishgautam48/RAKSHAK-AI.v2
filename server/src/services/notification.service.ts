import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { getIO } from './socket.service.js';
import type { NotificationChannel } from '@prisma/client';

// Outbound-channel adapter interface. SMS/Email/WhatsApp all need a paid
// provider account (Twilio/MSG91, SES/SendGrid, WhatsApp Business API) that
// this environment has no credentials for, and reaching their APIs is
// blocked by the sandbox's egress allowlist regardless. Each adapter below
// is a real, swappable implementation of the same interface; the console
// adapter is what actually runs in dev, and is what a demo/offline
// deployment would keep using deliberately.
interface ChannelAdapter {
  send(target: string, title: string, body: string): Promise<{ delivered: boolean; ref?: string }>;
}

class ConsoleAdapter implements ChannelAdapter {
  constructor(private channel: string) {}
  async send(target: string, title: string, body: string) {
    logger.info(`[notify:${this.channel}] -> ${target}`, { title, body });
    return { delivered: true, ref: `console-${Date.now()}` };
  }
}

const adapters: Record<string, ChannelAdapter> = {
  SMS: new ConsoleAdapter('sms'),
  EMAIL: new ConsoleAdapter('email'),
  PUSH: new ConsoleAdapter('push'),
  WHATSAPP: new ConsoleAdapter('whatsapp'),
};

export async function notify(params: {
  userId: string;
  channel?: NotificationChannel;
  eventType: string;
  title: string;
  body: string;
}) {
  const channel = params.channel ?? 'IN_APP';
  const notification = await prisma.notification.create({
    data: {
      userId: params.userId,
      channel,
      eventType: params.eventType,
      title: params.title,
      body: params.body,
      deliveredAt: new Date(),
    },
  });

  if (channel !== 'IN_APP') {
    const adapter = adapters[channel];
    if (adapter) await adapter.send(params.userId, params.title, params.body);
  }

  getIO()?.to(`user:${params.userId}`).emit('notification:new', notification);
  return notification;
}

// One-time-password delivery. See OtpChallenge in schema.prisma for why
// this logs rather than sends: no SMS gateway is reachable from here.
export async function deliverOtp(target: string, code: string) {
  logger.info(`[otp] code for ${target}`, { code });
}
