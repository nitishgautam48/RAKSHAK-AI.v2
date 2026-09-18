import http from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { ensureRoles } from './bootstrap/roles.js';
import { initSocket } from './services/socket.service.js';
import { registerVideoSignaling } from './routes/counselling.routes.js';

async function main() {
  await ensureRoles();

  const app = createApp();
  const httpServer = http.createServer(app);
  initSocket(httpServer);
  registerVideoSignaling();

  httpServer.listen(env.port, () => {
    logger.info(`traumasense-server listening on :${env.port}`, { env: env.nodeEnv });
  });
}

main().catch((err) => {
  logger.error('fatal_startup_error', { err: err instanceof Error ? err.stack : err });
  process.exit(1);
});
