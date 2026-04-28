import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { loanService } from '../services/loan.js';
import { ConflictError, ForbiddenError, PaymentRequiredError } from '../errors.js';
import type Database from 'better-sqlite3';

interface RouteParams {
  id: string;
}

export function loanRoutes(db: Database.Database): Router {
  const router = Router();

  const createLoanSchema = z.object({
    member_id: z.string().uuid(),
    book_id: z.string().uuid(),
  });

  router.post('/api/loans', (req: Request, res: Response) => {
    const parsed = createLoanSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues });
      return;
    }
    try {
      const loan = loanService.borrow(db, parsed.data.member_id, parsed.data.book_id);
      res.status(201).json(loan);
    } catch (err: unknown) {
      if (err instanceof ConflictError) {
        res.status(409).json({ error: err.message });
        return;
      }
      if (err instanceof ForbiddenError) {
        res.status(403).json({ error: err.message });
        return;
      }
      if (err instanceof PaymentRequiredError) {
        res.status(402).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  router.post('/api/loans/:id/return', (req: Request<RouteParams>, res: Response) => {
    const returnedAt = req.query.returned_at as string | undefined;
    try {
      const loan = loanService.returnLoan(db, req.params.id, returnedAt);
      res.json(loan);
    } catch (err: unknown) {
      if (err instanceof ConflictError) {
        res.status(409).json({ error: err.message });
        return;
      }
      if (err instanceof Error && err.message === 'Loan not found') {
        res.status(404).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  return router;
}