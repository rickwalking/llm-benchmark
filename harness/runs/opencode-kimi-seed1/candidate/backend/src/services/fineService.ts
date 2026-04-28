import type { DatabaseInstance } from '../db/database.js';
import { NotFoundError, ConflictError } from '../errors.js';

export interface Fine {
  id: string;
  member_id: string;
  loan_id: string;
  amount_cents: number;
  paid_at: string | null;
  book_title: string;
}

export function getUnpaidFinesForMember(db: DatabaseInstance, memberId: string): Fine[] {
  const stmt = db.prepare(`
    SELECT 
      f.id,
      f.member_id,
      f.loan_id,
      f.amount_cents,
      f.paid_at,
      b.title as book_title
    FROM fines f
    JOIN loans l ON f.loan_id = l.id
    JOIN books b ON l.book_id = b.id
    WHERE f.member_id = ? AND f.paid_at IS NULL
    ORDER BY f.created_at DESC
  `);
  
  return stmt.all(memberId) as Fine[];
}

export function getFineHistoryForMember(db: DatabaseInstance, memberId: string): Fine[] {
  const stmt = db.prepare(`
    SELECT 
      f.id,
      f.member_id,
      f.loan_id,
      f.amount_cents,
      f.paid_at,
      b.title as book_title
    FROM fines f
    JOIN loans l ON f.loan_id = l.id
    JOIN books b ON l.book_id = b.id
    WHERE f.member_id = ? AND f.paid_at IS NOT NULL
    ORDER BY f.paid_at DESC
  `);
  
  return stmt.all(memberId) as Fine[];
}

export function payFine(db: DatabaseInstance, fineId: string): Fine {
  const fineStmt = db.prepare(`
    SELECT 
      f.id,
      f.member_id,
      f.loan_id,
      f.amount_cents,
      f.paid_at,
      b.title as book_title
    FROM fines f
    JOIN loans l ON f.loan_id = l.id
    JOIN books b ON l.book_id = b.id
    WHERE f.id = ?
  `);
  
  const fine = fineStmt.get(fineId) as Fine | undefined;
  if (!fine) {
    throw new NotFoundError('Fine');
  }
  
  if (fine.paid_at) {
    throw new ConflictError('Fine already paid');
  }
  
  const paidAt = new Date().toISOString();
  const updateStmt = db.prepare(`
    UPDATE fines SET paid_at = ? WHERE id = ?
  `);
  updateStmt.run(paidAt, fineId);
  
  return {
    ...fine,
    paid_at: paidAt
  };
}
