import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseInstance } from '../db/database.js';
import * as reservationService from '../services/reservationService.js';
import { NotFoundError, ConflictError } from '../errors.js';

const router = Router();

const createReservationSchema = z.object({
  member_id: z.string().uuid(),
  book_id: z.string().uuid()
});

export function createReservationRoutes(db: DatabaseInstance) {
  // POST /api/reservations - Create a reservation
  router.post('/', (req, res) => {
    try {
      const input = createReservationSchema.parse(req.body);
      const reservation = reservationService.createReservation(db, input);
      res.status(201).json(reservation);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid input', details: error.errors });
      } else if (error instanceof NotFoundError) {
        res.status(404).json({ error: error.message });
      } else if (error instanceof ConflictError) {
        res.status(409).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });

  // POST /api/reservations/:id/cancel - Cancel a reservation
  router.post('/:id/cancel', (req, res) => {
    try {
      reservationService.cancelReservation(db, req.params.id);
      res.json({ success: true });
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

  // POST /api/reservations/expire - Trigger expiration of stale reservations
  router.post('/expire', (_req, res) => {
    try {
      reservationService.expireStaleReservations(db);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
