type Level = 'debug' | 'info' | 'warn' | 'error';

function line(level: Level, msg: string, meta?: unknown) {
  const entry = { ts: new Date().toISOString(), level, msg, ...(meta ? { meta } : {}) };
  const out = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  out(JSON.stringify(entry));
}

export const logger = {
  debug: (msg: string, meta?: unknown) => line('debug', msg, meta),
  info: (msg: string, meta?: unknown) => line('info', msg, meta),
  warn: (msg: string, meta?: unknown) => line('warn', msg, meta),
  error: (msg: string, meta?: unknown) => line('error', msg, meta),
};
