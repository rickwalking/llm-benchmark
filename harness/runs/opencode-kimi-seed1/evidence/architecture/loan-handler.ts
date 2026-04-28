import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseInstance } from '../db/database.js';
import * as loanService from '../services/loanService.js';
import { NotFoundError, ConflictError, ForbiddenError, PaymentRequiredError } from '../errors.js';

const router = Router();

const createLoanSchema = z.object({
  member_id: z.string().uuid(),
  book_id: z.string().uuid()
});

export function createLoanRoutes(db: DatabaseInstance) {
  // POST /api/loans - Create a loan (checkout)
  router.post('/', (req, res) => {
    try {
      const input = createLoanSchema.parse(req.body);
      const loan = loanService.createLoan(db, input);
      res.status(201).json(loan);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid input', details: error.errors });
      } else if (error instanceof NotFoundError) {
        res.status(404).json({ error: error.message });
      } else if (error instanceof ForbiddenError) {
        res.status(403).json({ error: error.message });
      } else if (error instanceof PaymentRequiredError) {
        res.status(402).json({ error: error.message });
      } else if (error instanceof ConflictError) {
        res.status(409).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });

  // POST /api/loans/:id/return - Return a book
  router.post('/:id/return', (req, res) => {
    try {
      const loan = loanService.returnLoan(db, req.params.id);
      res.json(loan);
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
