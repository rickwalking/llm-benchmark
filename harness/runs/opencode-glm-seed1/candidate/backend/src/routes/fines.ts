import { Router, type Request, type Response } from 'express';
import { fineService } from '../services/fine.js';
import { ConflictError } from '../errors.js';
import type Database from 'better-sqlite3';

interface RouteParams {
  id: string;
}

export function fineRoutes(db: Database.Database): Router {
  const router = Router();

  router.post('/api/fines/:id/pay', (req: Request<RouteParams>, res: Response) => {
    try {
      const fine = fineService.pay(db, req.params.id);
      res.json(fine);
    } catch (err: unknown) {
      if (err instanceof ConflictError) {
        res.status(409).json({ error: err.message });
        return;
      }
      if (err instanceof Error && err.message === 'Fine not found') {
        res.status(404).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  return router;
}