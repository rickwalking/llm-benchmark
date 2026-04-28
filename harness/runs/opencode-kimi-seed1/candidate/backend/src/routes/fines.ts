import { Router } from 'express';
import type { DatabaseInstance } from '../db/database.js';
import * as fineService from '../services/fineService.js';
import { NotFoundError, ConflictError } from '../errors.js';

const router = Router();

export function createFineRoutes(db: DatabaseInstance) {
  // POST /api/fines/:id/pay - Pay a fine
  router.post('/:id/pay', (req, res) => {
    try {
      const fine = fineService.payFine(db, req.params.id);
      res.json(fine);
    } catch (error) {
      if (error instanceof NotFoundError) {
        res.status(404).json({ error: error.message });
      } else if (error instanceof ConflictError) {
        res.status(409).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });

  return router;
}
