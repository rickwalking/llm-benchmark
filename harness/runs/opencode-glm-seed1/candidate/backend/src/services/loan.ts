import Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import { canBorrow, computeDueAt, computeFineCents, computeNotificationExpiry } from '../policy/index.js';
import { ConflictError, NotFoundError, ForbiddenError, PaymentRequiredError } from '../errors.js';

export interface LoanRow {
  id: string;
  book_id: string;
  member_id: string;
  borrowed_at: string;
  due_at: string;
  returned_at: string | null;
}

export const loanService = {
  borrow(db: Database.Database, memberId: string, bookId: string): LoanRow {
    const member = db.prepare('SELECT * FROM members WHERE id = ?').get(memberId) as {
      id: string;
      status: string;
    } | undefined;
    if (!member) throw new NotFoundError('Member not found');

    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId) as {
      id: string;
    } | undefined;
    if (!book) throw new NotFoundError('Book not found');

    const activeLoans = db.prepare(
      'SELECT COUNT(*) as count FROM loans WHERE member_id = ? AND returned_at IS NULL'
    ).get(memberId) as { count: number };

    const unpaidFines = db.prepare(
      "SELECT COALESCE(SUM(amount_cents), 0) as total FROM fines WHERE member_id = ? AND paid_at IS NULL"
    ).get(memberId) as { total: number };

    const eligibility = canBorrow(
      member as { id: string; name: string; email: string; status: 'active' | 'suspended'; member_since: string },
      activeLoans.count,
      unpaidFines.total
    );

    if (!eligibility.canBorrow) {
      if (eligibility.reason === 'loan_limit') throw new ConflictError('Loan limit reached');
      if (eligibility.reason === 'suspended') throw new ForbiddenError('Member is suspended');
      if (eligibility.reason === 'fines') throw new PaymentRequiredError('Outstanding fines exceed limit');
    }

    const availableCopies = db.prepare(
      `SELECT (b.total_copies - COALESCE((SELECT COUNT(*) FROM loans l WHERE l.book_id = b.id AND l.returned_at IS NULL), 0)) as available
       FROM books b WHERE b.id = ?`
    ).get(bookId) as { available: number };

    const notifiedReservation = db.prepare(
      "SELECT * FROM reservations WHERE book_id = ? AND member_id = ? AND status = 'notified'"
    ).get(bookId, memberId) as { id: string } | undefined;

    if (availableCopies.available <= 0 && !notifiedReservation) {
      const anyNotified = db.prepare(
        "SELECT * FROM reservations WHERE book_id = ? AND status = 'notified'"
      ).get(bookId) as { id: string } | undefined;

      if (anyNotified) {
        throw new ConflictError('Book is reserved for another member');
      }
      throw new ConflictError('No copies available — reserve instead');
    }

    if (notifiedReservation) {
      db.prepare(
        "UPDATE reservations SET status = 'fulfilled' WHERE id = ?"
      ).run(notifiedReservation.id);
    } else if (availableCopies.available <= 0) {
      throw new ConflictError('No copies available — reserve instead');
    }

    const now = new Date();
    const dueAt = computeDueAt(now);
    const id = uuid();

    db.prepare(
      'INSERT INTO loans (id, book_id, member_id, borrowed_at, due_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, bookId, memberId, now.toISOString(), dueAt.toISOString());

    return db.prepare('SELECT * FROM loans WHERE id = ?').get(id) as LoanRow;
  },

  returnLoan(db: Database.Database, loanId: string, returnedAt?: string): LoanRow {
    const loan = db.prepare('SELECT * FROM loans WHERE id = ?').get(loanId) as LoanRow | undefined;
    if (!loan) throw new NotFoundError('Loan not found');
    if (loan.returned_at) throw new ConflictError('Loan already returned');

    const now = returnedAt ?? new Date().toISOString();
    db.prepare('UPDATE loans SET returned_at = ? WHERE id = ?').run(now, loanId);

    const days = Math.ceil(
      (new Date(now).getTime() - new Date(loan.due_at).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (days > 0) {
      const fineCents = computeFineCents(loan.borrowed_at, loan.due_at, now);
      db.prepare(
        'INSERT INTO fines (id, member_id, loan_id, amount_cents) VALUES (?, ?, ?, ?)'
      ).run(uuid(), loan.member_id, loanId, fineCents);
    }

    const waitingReservation = db.prepare(
      `SELECT * FROM reservations
       WHERE book_id = ? AND status = 'waiting'
       ORDER BY queued_at ASC
       LIMIT 1`
    ).get(loan.book_id) as { id: string; member_id: string } | undefined;

    if (waitingReservation) {
      const notifiedAt = new Date();
      const expiresAt = computeNotificationExpiry(notifiedAt);
      db.prepare(
        "UPDATE reservations SET status = 'notified', notified_at = ?, expires_at = ? WHERE id = ?"
      ).run(notifiedAt.toISOString(), expiresAt.toISOString(), waitingReservation.id);
    } else {
      db.prepare(
        `UPDATE books SET total_copies = total_copies WHERE id = ?`
      ).run(loan.book_id);
    }

    return db.prepare('SELECT * FROM loans WHERE id = ?').get(loanId) as LoanRow;
  },

  getActiveLoans(db: Database.Database, memberId: string): LoanRow[] {
    return db.prepare(
      'SELECT * FROM loans WHERE member_id = ? AND returned_at IS NULL ORDER BY due_at'
    ).all(memberId) as LoanRow[];
  },
};