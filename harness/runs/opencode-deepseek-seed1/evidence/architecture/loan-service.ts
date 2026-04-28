import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import { ConflictError, ForbiddenError, NotFoundError, PaymentRequiredError } from '../errors.js';
import { canBorrow, computeFineCents, nextReservationToNotify, RESERVATION_NOTIFICATION_HOURS } from '../policy/index.js';
import type { Loan, Reservation } from '../types.js';

interface BorrowInput {
  memberId: string;
  bookId: string;
}

export function borrowBook(db: Database.Database, input: BorrowInput): Loan {
  const member = db.prepare('SELECT id, status FROM members WHERE id = ?').get(input.memberId) as { id: string; status: string } | undefined;
  if (!member) throw new NotFoundError('Member not found');

  const book = db.prepare(`
    SELECT b.*,
      b.total_copies - COALESCE(l.active_loans, 0) - COALESCE(n.notified_count, 0) as available_copies
    FROM books b
    LEFT JOIN (
      SELECT book_id, COUNT(*) as active_loans FROM loans WHERE returned_at IS NULL GROUP BY book_id
    ) l ON l.book_id = b.id
    LEFT JOIN (
      SELECT book_id, COUNT(*) as notified_count FROM reservations WHERE status = 'notified' GROUP BY book_id
    ) n ON n.book_id = b.id
    WHERE b.id = ?
  `).get(input.bookId) as (import('../types.js').Book & { available_copies: number }) | undefined;
  if (!book) throw new NotFoundError('Book not found');

  const activeLoanCount = db.prepare(
    'SELECT COUNT(*) as cnt FROM loans WHERE member_id = ? AND returned_at IS NULL',
  ).get(input.memberId) as { cnt: number };

  const unpaidFines = db.prepare(
    'SELECT COALESCE(SUM(amount_cents), 0) as total FROM fines WHERE member_id = ? AND paid_at IS NULL',
  ).get(input.memberId) as { total: number };

  const borrowCheck = canBorrow({
    memberStatus: member.status as 'active' | 'suspended',
    activeLoanCount: activeLoanCount.cnt,
    unpaidFinesCents: unpaidFines.total,
  });

  if (!borrowCheck.allowed) {
    if (borrowCheck.reason === 'Member is suspended') throw new ForbiddenError('Member is suspended');
    if (borrowCheck.reason === 'Loan limit reached') throw new ConflictError('Loan limit reached');
    if (borrowCheck.reason === 'Outstanding fines exceed limit') throw new PaymentRequiredError('Outstanding fines exceed limit');
  }

  const existingLoan = db.prepare(
    'SELECT id FROM loans WHERE member_id = ? AND book_id = ? AND returned_at IS NULL',
  ).get(input.memberId, input.bookId);
  if (existingLoan) {
    throw new ConflictError('Member already has this book on loan');
  }

  if (book.available_copies <= 0) {
    const headReservation = db.prepare(`
      SELECT * FROM reservations
      WHERE book_id = ? AND status = 'notified'
      ORDER BY queued_at ASC LIMIT 1
    `).get(input.bookId) as Reservation | undefined;

    if (headReservation) {
      if (headReservation.member_id !== input.memberId) {
        throw new ConflictError('Book is reserved for another member');
      }
    } else {
      throw new ConflictError('No copies available — reserve instead');
    }
  }

  const id = uuid();
  const borrowedAt = new Date();
  const dueAt = new Date(borrowedAt.getTime() + 14 * 24 * 60 * 60 * 1000);

  const tx = db.transaction(() => {
    db.prepare(
      'INSERT INTO loans (id, book_id, member_id, borrowed_at, due_at) VALUES (?, ?, ?, ?, ?)',
    ).run(id, input.bookId, input.memberId, borrowedAt.toISOString(), dueAt.toISOString());

    // If this member had a notified reservation for this book, fulfill it
    const reservation = db.prepare(`
      SELECT * FROM reservations
      WHERE book_id = ? AND member_id = ? AND status = 'notified'
      LIMIT 1
    `).get(input.bookId, input.memberId) as Reservation | undefined;

    if (reservation) {
      db.prepare(
        "UPDATE reservations SET status = 'fulfilled' WHERE id = ?",
      ).run(reservation.id);
    }
  });

  tx();

  return { id, book_id: input.bookId, member_id: input.memberId, borrowed_at: borrowedAt.toISOString(), due_at: dueAt.toISOString(), returned_at: null };
}

export function returnBook(db: Database.Database, loanId: string): { loan: Loan; fineCreated: boolean | null } {
  const loan = db.prepare('SELECT * FROM loans WHERE id = ?').get(loanId) as Loan | undefined;
  if (!loan) throw new NotFoundError('Loan not found');
  if (loan.returned_at) throw new ConflictError('Loan already returned');

  const returnedAt = new Date();

  const fineAmount = computeFineCents(
    new Date(loan.borrowed_at),
    new Date(loan.due_at),
    returnedAt,
  );

  let fineCreated: boolean | null = null;

  const tx = db.transaction(() => {
    db.prepare(
      'UPDATE loans SET returned_at = ? WHERE id = ?',
    ).run(returnedAt.toISOString(), loanId);

    if (fineAmount > 0) {
      const fineId = uuid();
      db.prepare(
        'INSERT INTO fines (id, member_id, loan_id, amount_cents) VALUES (?, ?, ?, ?)',
      ).run(fineId, loan.member_id, loanId, fineAmount);
      fineCreated = true;
    } else {
      fineCreated = false;
    }

    // Check for reservations that should be notified
    const reservations = db.prepare(`
      SELECT * FROM reservations
      WHERE book_id = ? AND status = 'waiting'
      ORDER BY queued_at ASC
    `).all(loan.book_id) as Reservation[];

    const next = nextReservationToNotify(reservations);
    if (next) {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + RESERVATION_NOTIFICATION_HOURS * 60 * 60 * 1000);
      db.prepare(
        "UPDATE reservations SET status = 'notified', notified_at = ?, expires_at = ? WHERE id = ?",
      ).run(now.toISOString(), expiresAt.toISOString(), next.id);
    }
  });

  tx();

  const updatedLoan = db.prepare('SELECT * FROM loans WHERE id = ?').get(loanId) as Loan;

  return { loan: updatedLoan, fineCreated };
}
