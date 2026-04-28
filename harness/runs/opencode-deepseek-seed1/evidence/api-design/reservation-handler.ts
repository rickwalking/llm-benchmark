import { Router, type Request, type Response } from 'express';
import { getDb } from '../db.js';
import * as reservationService from '../services/reservationService.js';
import { createReservationSchema } from '../validators.js';
import { DomainError } from '../errors.js';

const router = Router();

router.post('/', (req: Request, res: Response) => {
  const parsed = createReservationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }

  const db = getDb();
  try {
    const reservation = reservationService.createReservation(db, {
      memberId: parsed.data.member_id,
      bookId: parsed.data.book_id,
    });
    res.status(201).json(reservation);
  } catch (err) {
    if (err instanceof DomainError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    throw err;
  }
});

router.post('/expire', (_req: Request, res: Response) => {
  const db = getDb();
  const count = reservationService.expireStaleReservations(db);
  res.json({ expired_count: count });
});

router.post('/:id/cancel', (req: Request, res: Response) => {
  const db = getDb();
  try {
    const reservation = reservationService.cancelReservation(db, req.params.id as string);
    res.json(reservation);
  } catch (err) {
    if (err instanceof DomainError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    throw err;
  }
});

export default router;
