import { v4 as uuidv4 } from 'uuid';
import type { DB } from '../db/index.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  PaymentRequiredError,
} from '../errors.js';
import {
  canBorrow,
  computeFineCents,
  dueDateFromBorrow,
} from '../policy/index.js';
import {
  activeLoanCountFor,
  getMemberRow,
  unpaidFinesCentsFor,
} from './memberService.js';
import {
  expireStaleReservations,
  promoteNextWaiting,
} from './reservationService.js';
import type { LoanRow } from '../types.js';

export interface BorrowInput {
  member_id: string;
  book_id: string;
  borrowed_at?: string;
}

export interface BorrowResult {
  loan: LoanRow;
  warnings: string[];
}

export function borrow(db: DB, input: BorrowInput): BorrowResult {
  expireStaleReservations(db);

  const book = db
    .prepare('SELECT id, total_copies FROM books WHERE id = ?')
    .get(input.book_id) as { id: string; total_copies: number } | undefined;
  if (!book) {
    throw new NotFoundError('Book not found');
  }

  const member = getMemberRow(db, input.member_id);

  const activeLoanCount = activeLoanCountFor(db, member.id);
  const unpaidFines = unpaidFinesCentsFor(db, member.id);
  const decision = canBorrow(member, activeLoanCount, unpaidFines);
  if (!decision.allowed) {
    if (decision.reason === 'suspended') {
      throw new ForbiddenError('Member is suspended');
    }
    if (decision.reason === 'fines_exceeded') {
      throw new PaymentRequiredError('Outstanding fines exceed limit');
    }
    if (decision.reason === 'loan_limit') {
      throw new ConflictError('Loan limit reached');
    }
  }

  const activeLoansForBook = (
    db
      .prepare(
        'SELECT COUNT(*) AS n FROM loans WHERE book_id = ? AND returned_at IS NULL',
      )
      .get(input.book_id) as { n: number }
  ).n;
  const notifiedReservation = db
    .prepare(
      "SELECT id, member_id FROM reservations WHERE book_id = ? AND status = 'notified' ORDER BY queued_at ASC LIMIT 1",
    )
    .get(input.book_id) as { id: string; member_id: string } | undefined;

  const physicallyAvailable = book.total_copies - activeLoansForBook;
  let fulfillingReservationId: string | null = null;

  if (notifiedReservation) {
    if (notifiedReservation.member_id !== member.id) {
      throw new ConflictError('Book is reserved for another member');
    }
    fulfillingReservationId = notifiedReservation.id;
  } else if (physicallyAvailable <= 0) {
    throw new ConflictError('No copies available — reserve instead');
  }

  const borrowedAt = input.borrowed_at ? new Date(input.borrowed_at) : new Date();
  const dueAt = dueDateFromBorrow(borrowedAt);
  const id = uuidv4();

  const tx = db.transaction(() => {
    db.prepare(
      'INSERT INTO loans (id, book_id, member_id, borrowed_at, due_at) VALUES (?, ?, ?, ?, ?)',
    ).run(id, input.book_id, member.id, borrowedAt.toISOString(), dueAt.toISOString());

    if (fulfillingReservationId) {
      db.prepare(
        "UPDATE reservations SET status = 'fulfilled' WHERE id = ?",
      ).run(fulfillingReservationId);
    }
  });
  tx();

  const warnings: string[] = [];
  if (activeLoanCount + 1 === 5) {
    warnings.push('This is the member’s 5th active loan (limit reached).');
  }

  const loan: LoanRow = {
    id,
    book_id: input.book_id,
    member_id: member.id,
    borrowed_at: borrowedAt.toISOString(),
    due_at: dueAt.toISOString(),
    returned_at: null,
  };
  return { loan, warnings };
}

export interface ReturnInput {
  loan_id: string;
  returned_at?: string;
}

export interface ReturnResult {
  loan: LoanRow;
  fine_cents: number;
  fine_id: string | null;
  notified_reservation_id: string | null;
}

export function returnLoan(db: DB, input: ReturnInput): ReturnResult {
  const loan = db
    .prepare('SELECT * FROM loans WHERE id = ?')
    .get(input.loan_id) as LoanRow | undefined;
  if (!loan) {
    throw new NotFoundError('Loan not found');
  }
  if (loan.returned_at !== null) {
    throw new ConflictError('Loan already returned');
  }

  const returnedAt = input.returned_at ? new Date(input.returned_at) : new Date();
  const dueAt = new Date(loan.due_at);
  const borrowedAt = new Date(loan.borrowed_at);
  const fineCents = computeFineCents(borrowedAt, dueAt, returnedAt);

  let fineId: string | null = null;
  let notifiedReservationId: string | null = null;

  const tx = db.transaction(() => {
    db.prepare('UPDATE loans SET returned_at = ? WHERE id = ?').run(
      returnedAt.toISOString(),
      loan.id,
    );

    if (fineCents > 0) {
      fineId = uuidv4();
      db.prepare(
        'INSERT INTO fines (id, member_id, loan_id, amount_cents) VALUES (?, ?, ?, ?)',
      ).run(fineId, loan.member_id, loan.id, fineCents);
    }

    const hasNotified = db
      .prepare(
        "SELECT id FROM reservations WHERE book_id = ? AND status = 'notified' LIMIT 1",
      )
      .get(loan.book_id) as { id: string } | undefined;
    if (!hasNotified) {
      const next = db
        .prepare(
          "SELECT id FROM reservations WHERE book_id = ? AND status = 'waiting' ORDER BY queued_at ASC LIMIT 1",
        )
        .get(loan.book_id) as { id: string } | undefined;
      if (next) {
        promoteNextWaiting(db, loan.book_id);
        notifiedReservationId = next.id;
      }
    }
  });
  tx();

  const refreshed = db
    .prepare('SELECT * FROM loans WHERE id = ?')
    .get(loan.id) as LoanRow;

  return {
    loan: refreshed,
    fine_cents: fineCents,
    fine_id: fineId,
    notified_reservation_id: notifiedReservationId,
  };
}

export function listActiveLoans(db: DB): LoanRow[] {
  return db
    .prepare(
      'SELECT id, book_id, member_id, borrowed_at, due_at, returned_at FROM loans WHERE returned_at IS NULL ORDER BY due_at ASC',
    )
    .all() as LoanRow[];
}
