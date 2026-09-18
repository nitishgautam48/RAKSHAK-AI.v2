import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { generalLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { authRouter } from './routes/auth.routes.js';
import { victimsRouter } from './routes/victims.routes.js';
import { complaintsRouter } from './routes/complaints.routes.js';
import { casesRouter } from './routes/cases.routes.js';
import { assessmentsRouter } from './routes/assessments.routes.js';
import { documentsRouter } from './routes/documents.routes.js';
import { legalAidRouter } from './routes/legalAid.routes.js';
import { counsellingRouter } from './routes/counselling.routes.js';
import { sosRouter } from './routes/sos.routes.js';
import { notificationsRouter } from './routes/notifications.routes.js';
import { gisRouter } from './routes/gis.routes.js';
import { analyticsRouter } from './routes/analytics.routes.js';
import { consentRouter } from './routes/consent.routes.js';
import { adminRouter } from './routes/admin.routes.js';
import { recommendationsRouter } from './routes/recommendations.routes.js';
import { interventionsRouter } from './routes/interventions.routes.js';
import { staffRouter } from './routes/staff.routes.js';
import { metaRouter } from './routes/meta.routes.js';
import { systemSettingsRouter } from './routes/systemSettings.routes.js';
import { aiMonitoringRouter } from './routes/aiMonitoring.routes.js';
import { assistantRouter } from './routes/assistant.routes.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.corsOrigins, credentials: true }));
  app.use(express.json({ limit: '5mb' }));
  app.use(morgan(env.nodeEnv === 'development' ? 'dev' : 'combined'));
  app.use(generalLimiter);

  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'traumasense-server', time: new Date().toISOString() }));

  app.use('/api/auth', authRouter);
  app.use('/api/victims', victimsRouter);
  app.use('/api/complaints', complaintsRouter);
  app.use('/api/cases', casesRouter);
  app.use('/api/assessments', assessmentsRouter);
  app.use('/api/documents', documentsRouter);
  app.use('/api/legal-aid', legalAidRouter);
  app.use('/api/counselling', counsellingRouter);
  app.use('/api/sos', sosRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/gis', gisRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/consent', consentRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/recommendations', recommendationsRouter);
  app.use('/api/interventions', interventionsRouter);
  app.use('/api/staff', staffRouter);
  app.use('/api/meta', metaRouter);
  app.use('/api/system-settings', systemSettingsRouter);
  app.use('/api/ai-monitoring', aiMonitoringRouter);
  app.use('/api/assistant', assistantRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
