import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseInstance } from '../db/database.js';
import * as memberService from '../services/memberService.js';
import * as loanService from '../services/loanService.js';
import * as reservationService from '../services/reservationService.js';
import * as fineService from '../services/fineService.js';
import { NotFoundError, ConflictError } from '../errors.js';

const router = Router();

const createMemberSchema = z.object({
  name: z.string().min(1),
  email: z.string().email()
});

export function createMemberRoutes(db: DatabaseInstance) {
  // GET /api/members - List all members
  router.get('/', (_req, res) => {
    try {
      const members = memberService.listMembers(db);
      res.json(members);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/members/:id - Get single member with stats
  router.get('/:id', (req, res) => {
    try {
      const member = memberService.getMember(db, req.params.id);
      res.json(member);
    } catch (error) {
      if (error instanceof NotFoundError) {
        res.status(404).json({ error: 'Member not found' });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });

  // POST /api/members - Create a member
  router.post('/', (req, res) => {
    try {
      const input = createMemberSchema.parse(req.body);
      const member = memberService.createMember(db, input);
      res.status(201).json(member);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid input', details: error.errors });
      } else if (error instanceof ConflictError) {
        res.status(409).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });

  // GET /api/members/:id/loans - Get member's active loans
  router.get('/:id/loans', (req, res) => {
    try {
      const loans = loanService.getActiveLoansForMember(db, req.params.id);
      res.json(loans);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/members/:id/loans/history - Get member's loan history
  router.get('/:id/loans/history', (req, res) => {
    try {
      const loans = loanService.getLoanHistoryForMember(db, req.params.id);
      res.json(loans);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/members/:id/reservations - Get member's reservations
  router.get('/:id/reservations', (req, res) => {
    try {
      const reservations = reservationService.getReservationsForMember(db, req.params.id);
      res.json(reservations);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/members/:id/fines - Get member's unpaid fines
  router.get('/:id/fines', (req, res) => {
    try {
      const fines = fineService.getUnpaidFinesForMember(db, req.params.id);
      res.json(fines);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
