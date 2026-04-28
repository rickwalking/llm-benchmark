import { Router, type Request, type Response } from 'express';
import { getDb } from '../db.js';
import * as fineService from '../services/fineService.js';
import { DomainError } from '../errors.js';

const router = Router();

router.post('/:id/pay', (req: Request, res: Response) => {
  const db = getDb();
  try {
    const fine = fineService.payFine(db, req.params.id as string);
    res.json(fine);
  } catch (err) {
    if (err instanceof DomainError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    throw err;
  }
});

export default router;
