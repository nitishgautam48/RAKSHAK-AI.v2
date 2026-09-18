import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required('DATABASE_URL', 'file:./data/traumasense.db'),
  jwtSecret: required('JWT_SECRET', 'dev-insecure-secret-change-me'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
  refreshExpiresIn: process.env.REFRESH_EXPIRES_IN ?? '30d',
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:5183').split(','),
  storageRoot: process.env.STORAGE_ROOT ?? './storage',
  aiServiceUrl: process.env.AI_SERVICE_URL ?? 'http://localhost:8000',
  aiServiceKey: process.env.AI_SERVICE_KEY ?? 'dev-insecure-service-key-change-me',
  encryptionKey: required('ENCRYPTION_KEY', 'dev-insecure-32-byte-key-change-me!!'),
  govEmailDomains: (process.env.GOV_EMAIL_DOMAINS ?? '.gov.in,.nic.in,.police.gov.in').split(','),
  otpDevMode: (process.env.OTP_DEV_MODE ?? 'true') === 'true',
};
