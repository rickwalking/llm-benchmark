import { Router, type Request, type Response } from 'express';
import { getDb } from '../db.js';
import * as loanService from '../services/loanService.js';
import { createLoanSchema } from '../validators.js';
import { DomainError } from '../errors.js';

const router = Router();

router.post('/', (req: Request, res: Response) => {
  const parsed = createLoanSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }

  const db = getDb();
  try {
    const loan = loanService.borrowBook(db, {
      memberId: parsed.data.member_id,
      bookId: parsed.data.book_id,
    });
    res.status(201).json(loan);
  } catch (err) {
    if (err instanceof DomainError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    throw err;
  }
});

router.post('/:id/return', (req: Request, res: Response) => {
  const db = getDb();
  try {
    const result = loanService.returnBook(db, req.params.id as string);
    res.json(result);
  } catch (err) {
    if (err instanceof DomainError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    throw err;
  }
});

export default router;
