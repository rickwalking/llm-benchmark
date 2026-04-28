import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { existsSync, mkdirSync } from 'fs';
import { initDatabase } from './db/index.js';
import { bookRoutes } from './routes/books.js';
import { memberRoutes } from './routes/members.js';
import { loanRoutes } from './routes/loans.js';
import { reservationRoutes } from './routes/reservations.js';
import { fineRoutes } from './routes/fines.js';
import type BetterSqlite3 from 'better-sqlite3';

type Database = BetterSqlite3.Database;

export function createApp(db?: Database): { app: express.Express; db: Database } {
  const app = express();

  const database: Database = db ?? (() => {
    const dbPath = './data/library.db';
    if (!existsSync('./data')) {
      mkdirSync('./data', { recursive: true });
    }
    return initDatabase(dbPath);
  })();

  app.use(helmet());
  app.use(cors({ origin: 'http://localhost:5173' }));
  app.use(express.json());

  app.use(bookRoutes(database));
  app.use(memberRoutes(database));
  app.use(loanRoutes(database));
  app.use(reservationRoutes(database));
  app.use(fineRoutes(database));

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return { app, db: database };
}

export { initDatabase };