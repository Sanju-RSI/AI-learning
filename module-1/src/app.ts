import express from 'express';
import type { Pool } from 'pg';
import type { AppConfig } from './config.js';
import { errorHandler } from './middleware/error-handler.js';
import { createAuthRouter } from './modules/auth/routes.js';
import { createLeaveRouter } from './modules/leave/routes.js';
import { createUserRouter } from './modules/users/routes.js';

export function createApp(pool: Pool, config: AppConfig): express.Express {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/auth', createAuthRouter(pool, config));
  app.use('/api/users', createUserRouter(pool, config));
  app.use('/api/leave', createLeaveRouter(pool, config));
  app.use(errorHandler);

  return app;
}
