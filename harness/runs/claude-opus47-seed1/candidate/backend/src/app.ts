import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { DB } from './db/index.js';
import { errorHandler, notFound } from './http/middleware.js';
import { buildRouter } from './http/routes.js';

export interface AppOptions {
  corsOrigin?: string;
}

export function buildApp(db: DB, options: AppOptions = {}): Express {
  const app = express();
  app.use(helmet());
  app.use(
    cors({
      origin: options.corsOrigin ?? 'http://localhost:5173',
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api', buildRouter(db));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
