import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { memberService } from '../services/member.js';
import { reservationService } from '../services/reservation.js';
import { loanService } from '../services/loan.js';
import type Database from 'better-sqlite3';

interface RouteParams {
  id: string;
}

export function memberRoutes(db: Database.Database): Router {
  const router = Router();

  router.get('/api/members', (_req: Request, res: Response) => {
    const members = memberService.list(db);
    res.json(members);
  });

  router.get('/api/members/:id', (req: Request<RouteParams>, res: Response) => {
    reservationService.expireStaleReservations(db);
    try {
      const member = memberService.get(db, req.params.id);
      const activeLoans = loanService.getActiveLoans(db, req.params.id);
      const reservations = reservationService.getReservationsForMember(db, req.params.id);
      const fines = db.prepare(
        'SELECT * FROM fines WHERE member_id = ? AND paid_at IS NULL ORDER BY id'
      ).all(req.params.id);
      res.json({ ...member, active_loans: activeLoans, reservations, fines });
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'Member not found') {
        res.status(404).json({ error: 'Member not found' });
        return;
      }
      throw err;
    }
  });

  const createMemberSchema = z.object({
    name: z.string().min(1),
    email: z.string().email(),
  });

  router.post('/api/members', (req: Request, res: Response) => {
    const parsed = createMemberSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues });
      return;
    }
    try {
      const member = memberService.create(db, parsed.data);
      res.status(201).json(member);
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'Email already exists') {
        res.status(409).json({ error: 'Email already exists' });
        return;
      }
      throw err;
    }
  });

  return router;
}