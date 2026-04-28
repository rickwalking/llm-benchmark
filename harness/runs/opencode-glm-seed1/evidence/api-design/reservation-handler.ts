import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { reservationService } from '../services/reservation.js';
import { ConflictError } from '../errors.js';
import type Database from 'better-sqlite3';

interface RouteParams {
  id: string;
}

export function reservationRoutes(db: Database.Database): Router {
  const router = Router();

  const createReservationSchema = z.object({
    member_id: z.string().uuid(),
    book_id: z.string().uuid(),
  });

  router.post('/api/reservations', (req: Request, res: Response) => {
    const parsed = createReservationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues });
      return;
    }
    try {
      const reservation = reservationService.reserve(db, parsed.data.member_id, parsed.data.book_id);
      res.status(201).json(reservation);
    } catch (err: unknown) {
      if (err instanceof ConflictError) {
        res.status(409).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  router.post('/api/reservations/expire', (_req: Request, res: Response) => {
    const count = reservationService.expireStaleReservations(db);
    res.json({ expired: count });
  });

  router.post('/api/reservations/:id/cancel', (req: Request<RouteParams>, res: Response) => {
    try {
      const reservation = reservationService.cancel(db, req.params.id);
      res.json(reservation);
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'Reservation not found') {
        res.status(404).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  return router;
}