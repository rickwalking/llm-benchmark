import { Router } from 'express';
import type { DB } from '../db/index.js';
import {
  createBook,
  getBook,
  listBooks,
} from '../services/bookService.js';
import {
  createMember,
  getMemberDetail,
  listMembers,
} from '../services/memberService.js';
import { borrow, listActiveLoans, returnLoan } from '../services/loanService.js';
import {
  cancelReservation,
  createReservation,
  expireStaleReservations,
} from '../services/reservationService.js';
import { listFines, payFine } from '../services/fineService.js';
import {
  createBookSchema,
  createLoanSchema,
  createMemberSchema,
  createReservationSchema,
} from './schemas.js';

export function buildRouter(db: DB): Router {
  const router = Router();

  // Books
  router.get('/books', (_req, res) => {
    res.json(listBooks(db));
  });

  router.get('/books/:id', (req, res) => {
    expireStaleReservations(db);
    res.json(getBook(db, req.params.id));
  });

  router.post('/books', (req, res, next) => {
    try {
      const input = createBookSchema.parse(req.body);
      const book = createBook(db, input);
      res.status(201).json(book);
    } catch (err) {
      next(err);
    }
  });

  // Members
  router.get('/members', (_req, res) => {
    res.json(listMembers(db));
  });

  router.get('/members/:id', (req, res) => {
    res.json(getMemberDetail(db, req.params.id));
  });

  router.post('/members', (req, res, next) => {
    try {
      const input = createMemberSchema.parse(req.body);
      const member = createMember(db, input);
      res.status(201).json(member);
    } catch (err) {
      next(err);
    }
  });

  // Loans
  router.get('/loans', (_req, res) => {
    res.json(listActiveLoans(db));
  });

  router.post('/loans', (req, res, next) => {
    try {
      const input = createLoanSchema.parse(req.body);
      const result = borrow(db, input);
      res.status(201).json({
        ...result.loan,
        warnings: result.warnings,
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/loans/:id/return', (req, res, next) => {
    try {
      const result = returnLoan(db, { loan_id: req.params.id });
      res.status(200).json({
        loan: result.loan,
        fine_cents: result.fine_cents,
        fine_id: result.fine_id,
        notified_reservation_id: result.notified_reservation_id,
      });
    } catch (err) {
      next(err);
    }
  });

  // Reservations
  router.post('/reservations', (req, res, next) => {
    try {
      const input = createReservationSchema.parse(req.body);
      const reservation = createReservation(db, input);
      res.status(201).json(reservation);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/reservations/:id', (req, res, next) => {
    try {
      const reservation = cancelReservation(db, req.params.id);
      res.status(200).json(reservation);
    } catch (err) {
      next(err);
    }
  });

  router.post('/reservations/expire', (_req, res) => {
    const count = expireStaleReservations(db);
    res.status(200).json({ expired_count: count });
  });

  // Fines
  router.get('/fines', (req, res) => {
    const memberId = typeof req.query.member_id === 'string' ? req.query.member_id : undefined;
    res.json(listFines(db, memberId));
  });

  router.post('/fines/:id/pay', (req, res, next) => {
    try {
      const fine = payFine(db, req.params.id);
      res.status(200).json(fine);
    } catch (err) {
      next(err);
    }
  });

  // Dev/test helpers (used by e2e harness to simulate time passing).
  router.post('/dev/backdate-loan', (req, res, next) => {
    try {
      const { loan_id, days, seconds } = req.body as {
        loan_id?: string;
        days?: number;
        seconds?: number;
      };
      if (!loan_id || (typeof days !== 'number' && typeof seconds !== 'number')) {
        res.status(400).json({ error: 'loan_id and days|seconds required' });
        return;
      }
      const ms =
        (typeof seconds === 'number' ? seconds : 0) * 1000 +
        (typeof days === 'number' ? days : 0) * 24 * 60 * 60 * 1000;
      const loan = db.prepare('SELECT borrowed_at, due_at FROM loans WHERE id = ?').get(loan_id) as
        | { borrowed_at: string; due_at: string }
        | undefined;
      if (!loan) {
        res.status(404).json({ error: 'Loan not found' });
        return;
      }
      const newBorrowed = new Date(new Date(loan.borrowed_at).getTime() - ms).toISOString();
      const newDue = new Date(new Date(loan.due_at).getTime() - ms).toISOString();
      db.prepare('UPDATE loans SET borrowed_at = ?, due_at = ? WHERE id = ?').run(
        newBorrowed,
        newDue,
        loan_id,
      );
      res.json({ loan_id, borrowed_at: newBorrowed, due_at: newDue });
    } catch (err) {
      next(err);
    }
  });

  router.post('/dev/backdate-reservation', (req, res, next) => {
    try {
      const { reservation_id, hours } = req.body as { reservation_id?: string; hours?: number };
      if (!reservation_id || typeof hours !== 'number') {
        res.status(400).json({ error: 'reservation_id and hours required' });
        return;
      }
      const ms = hours * 60 * 60 * 1000;
      const r = db
        .prepare('SELECT notified_at, expires_at FROM reservations WHERE id = ?')
        .get(reservation_id) as { notified_at: string | null; expires_at: string | null } | undefined;
      if (!r) {
        res.status(404).json({ error: 'Reservation not found' });
        return;
      }
      const newNotified = r.notified_at
        ? new Date(new Date(r.notified_at).getTime() - ms).toISOString()
        : null;
      const newExpires = r.expires_at
        ? new Date(new Date(r.expires_at).getTime() - ms).toISOString()
        : null;
      db.prepare(
        'UPDATE reservations SET notified_at = COALESCE(?, notified_at), expires_at = COALESCE(?, expires_at) WHERE id = ?',
      ).run(newNotified, newExpires, reservation_id);
      res.json({ reservation_id, notified_at: newNotified, expires_at: newExpires });
    } catch (err) {
      next(err);
    }
  });

  router.post('/dev/reset', (_req, res) => {
    db.exec("DELETE FROM fines; DELETE FROM reservations; DELETE FROM loans; DELETE FROM members; DELETE FROM books;");
    res.json({ ok: true });
  });

  return router;
}
