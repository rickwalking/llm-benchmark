import type { DatabaseInstance } from '../db/database.js';
import { NotFoundError, ConflictError, ForbiddenError, PaymentRequiredError } from '../errors.js';
import * as policy from '../policy/index.js';
import * as reservationService from './reservationService.js';

export interface Loan {
  id: string;
  book_id: string;
  member_id: string;
  borrowed_at: string;
  due_at: string;
  returned_at: string | null;
}

export interface LoanWithBook extends Loan {
  book_title: string;
  days_overdue: number;
}

export interface CreateLoanInput {
  member_id: string;
  book_id: string;
}

function getMemberStatus(db: DatabaseInstance, memberId: string): policy.MemberStatus {
  const memberStmt = db.prepare('SELECT status FROM members WHERE id = ?');
  const member = memberStmt.get(memberId) as { status: 'active' | 'suspended' } | undefined;
  if (!member) {
    throw new NotFoundError('Member');
  }
  
  const loansStmt = db.prepare(`
    SELECT COUNT(*) as count FROM loans 
    WHERE member_id = ? AND returned_at IS NULL
  `);
  const { count: activeLoans } = loansStmt.get(memberId) as { count: number };
  
  const finesStmt = db.prepare(`
    SELECT COALESCE(SUM(amount_cents), 0) as total 
    FROM fines 
    WHERE member_id = ? AND paid_at IS NULL
  `);
  const { total: unpaidFines } = finesStmt.get(memberId) as { total: number };
  
  return {
    status: member.status,
    activeLoansCount: activeLoans,
    unpaidFinesCents: unpaidFines
  };
}

function getBookAvailability(db: DatabaseInstance, bookId: string): { 
  available_copies: number;
  total_copies: number;
} {
  const stmt = db.prepare(`
    SELECT 
      total_copies,
      total_copies - COUNT(l.id) as available_copies
    FROM books b
    LEFT JOIN loans l ON b.id = l.book_id AND l.returned_at IS NULL
    WHERE b.id = ?
    GROUP BY b.id
  `);
  
  const result = stmt.get(bookId) as { available_copies: number; total_copies: number } | undefined;
  if (!result) {
    throw new NotFoundError('Book');
  }
  
  return result;
}

function hasActiveLoanForBook(db: DatabaseInstance, memberId: string, bookId: string): boolean {
  const stmt = db.prepare(`
    SELECT id FROM loans 
    WHERE member_id = ? AND book_id = ? AND returned_at IS NULL
  `);
  return !!stmt.get(memberId, bookId);
}

function getNotifiedReservationForMember(db: DatabaseInstance, memberId: string, bookId: string): 
  { id: string } | undefined {
  const stmt = db.prepare(`
    SELECT id FROM reservations 
    WHERE member_id = ? AND book_id = ? AND status = 'notified'
  `);
  return stmt.get(memberId, bookId) as { id: string } | undefined;
}

function hasNotifiedReservationForBook(db: DatabaseInstance, bookId: string): boolean {
  const stmt = db.prepare(`
    SELECT id FROM reservations 
    WHERE book_id = ? AND status = 'notified'
  `);
  return !!stmt.get(bookId);
}

export function createLoan(db: DatabaseInstance, input: CreateLoanInput): Loan {
  // Check member can borrow
  const memberStatus = getMemberStatus(db, input.member_id);
  const eligibility = policy.canBorrow(memberStatus);
  
  if (!eligibility.canBorrow) {
    if (eligibility.reason === 'suspended') {
      throw new ForbiddenError(eligibility.message);
    }
    if (eligibility.reason === 'loan_limit') {
      throw new ConflictError(eligibility.message);
    }
    if (eligibility.reason === 'outstanding_fines') {
      throw new PaymentRequiredError(eligibility.message);
    }
  }
  
  // Check member doesn't already have this book on loan
  if (hasActiveLoanForBook(db, input.member_id, input.book_id)) {
    throw new ConflictError('Member already has this book on loan');
  }
  
  // Check book availability
  const bookAvailability = getBookAvailability(db, input.book_id);
  const notifiedReservation = getNotifiedReservationForMember(db, input.member_id, input.book_id);
  
  if (bookAvailability.available_copies <= 0 && !notifiedReservation) {
    throw new ConflictError('No copies available — reserve instead');
  }
  
  // If there's a notified reservation for someone else, block
  if (hasNotifiedReservationForBook(db, input.book_id) && !notifiedReservation) {
    throw new ConflictError('Book is reserved for another member');
  }
  
  // Create the loan
  const id = crypto.randomUUID();
  const borrowedAt = new Date();
  const dueAt = policy.calculateDueDate(borrowedAt);
  
  const insertStmt = db.prepare(`
    INSERT INTO loans (id, book_id, member_id, borrowed_at, due_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  insertStmt.run(
    id, 
    input.book_id, 
    input.member_id, 
    borrowedAt.toISOString(),
    dueAt.toISOString()
  );
  
  // If this fulfilled a reservation, mark it fulfilled
  if (notifiedReservation) {
    reservationService.fulfillReservation(db, notifiedReservation.id);
  }
  
  return {
    id,
    book_id: input.book_id,
    member_id: input.member_id,
    borrowed_at: borrowedAt.toISOString(),
    due_at: dueAt.toISOString(),
    returned_at: null
  };
}

export function returnLoan(db: DatabaseInstance, loanId: string): Loan {
  const loanStmt = db.prepare('SELECT * FROM loans WHERE id = ?');
  const loan = loanStmt.get(loanId) as {
    id: string;
    book_id: string;
    member_id: string;
    borrowed_at: string;
    due_at: string;
    returned_at: string | null;
  } | undefined;
  
  if (!loan) {
    throw new NotFoundError('Loan');
  }
  
  if (loan.returned_at) {
    throw new ConflictError('Loan already returned');
  }
  
  const returnedAt = new Date();
  
  // Check for late fine
  const dueAt = new Date(loan.due_at);
  const borrowedAt = new Date(loan.borrowed_at);
  const fineCents = policy.computeFineCents(borrowedAt, dueAt, returnedAt);
  
  if (fineCents > 0) {
    const fineId = crypto.randomUUID();
    const fineStmt = db.prepare(`
      INSERT INTO fines (id, member_id, loan_id, amount_cents)
      VALUES (?, ?, ?, ?)
    `);
    fineStmt.run(fineId, loan.member_id, loanId, fineCents);
  }
  
  // Update loan
  const updateStmt = db.prepare(`
    UPDATE loans SET returned_at = ? WHERE id = ?
  `);
  updateStmt.run(returnedAt.toISOString(), loanId);
  
  // Check for reservations to notify
  const nextReservation = reservationService.findNextWaitingReservation(db, loan.book_id);
  if (nextReservation) {
    reservationService.notifyReservation(db, nextReservation.id);
  }
  
  return {
    ...loan,
    returned_at: returnedAt.toISOString()
  };
}

export function getActiveLoansForMember(db: DatabaseInstance, memberId: string): LoanWithBook[] {
  const stmt = db.prepare(`
    SELECT 
      l.id,
      l.book_id,
      l.member_id,
      l.borrowed_at,
      l.due_at,
      l.returned_at,
      b.title as book_title,
      CASE 
        WHEN l.due_at < datetime('now') THEN 
          CAST((julianday('now') - julianday(l.due_at)) AS INTEGER)
        ELSE 0
      END as days_overdue
    FROM loans l
    JOIN books b ON l.book_id = b.id
    WHERE l.member_id = ? AND l.returned_at IS NULL
    ORDER BY l.due_at
  `);
  
  return stmt.all(memberId) as LoanWithBook[];
}

export function getLoanHistoryForMember(db: DatabaseInstance, memberId: string): LoanWithBook[] {
  const stmt = db.prepare(`
    SELECT 
      l.id,
      l.book_id,
      l.member_id,
      l.borrowed_at,
      l.due_at,
      l.returned_at,
      b.title as book_title,
      0 as days_overdue
    FROM loans l
    JOIN books b ON l.book_id = b.id
    WHERE l.member_id = ? AND l.returned_at IS NOT NULL
    ORDER BY l.returned_at DESC
  `);
  
  return stmt.all(memberId) as LoanWithBook[];
}
