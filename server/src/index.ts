import http from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { ensureRoles } from './bootstrap/roles.js';
import { initSocket } from './services/socket.service.js';
import { registerVideoSignaling } from './routes/counselling.routes.js';
import { prisma } from './lib/prisma.js';
import { runAutoEscalationCheck } from './services/autoEscalation.service.js';

// Runs in-process on a simple interval - honest for the current
// single-instance deployment this codebase actually supports (no Redis/
// horizontal-scaling layer exists yet). Running this on more than one
// server instance would duplicate-check the same queue redundantly (though
// the cooldown check in autoEscalation.service.ts still prevents duplicate
// notifications) - worth revisiting if/when this ever runs multi-instance.
const AUTO_ESCALATION_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

async function main() {
  await ensureRoles();

  const app = createApp();
  const httpServer = http.createServer(app);
  initSocket(httpServer);
  registerVideoSignaling();

  const runEscalationCheck = () => {
    runAutoEscalationCheck(prisma)
      .then((results) => { if (results.length) logger.info('auto_escalation_check', { escalated: results.length }); })
      .catch((err) => logger.error('auto_escalation_check_failed', { err: err instanceof Error ? err.stack : err }));
  };
  runEscalationCheck();
  setInterval(runEscalationCheck, AUTO_ESCALATION_INTERVAL_MS);

  httpServer.listen(env.port, () => {
    logger.info(`traumasense-server listening on :${env.port}`, { env: env.nodeEnv });
  });
}

main().catch((err) => {
  logger.error('fatal_startup_error', { err: err instanceof Error ? err.stack : err });
  process.exit(1);
});
