import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import type Database from 'better-sqlite3';
import { getDb } from './db.js';
import { DomainError } from './errors.js';
import booksRouter from './routes/books.js';
import membersRouter from './routes/members.js';
import loansRouter from './routes/loans.js';
import reservationsRouter from './routes/reservations.js';
import finesRouter from './routes/fines.js';

export function createApp(dbOverride?: Database.Database) {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: 'http://localhost:5173' }));
  app.use(express.json());

  if (dbOverride) {
    (app as unknown as Record<string, unknown>).__testDb = dbOverride;
  } else {
    getDb();
  }

  app.use('/api/books', booksRouter);
  app.use('/api/members', membersRouter);
  app.use('/api/loans', loansRouter);
  app.use('/api/reservations', reservationsRouter);
  app.use('/api/fines', finesRouter);

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof DomainError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

const PORT = parseInt(process.env.PORT || '3001', 10);

const app = createApp();
app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});

export { app };
