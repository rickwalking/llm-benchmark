import type { DatabaseInstance } from '../db/database.js';
import { NotFoundError, ConflictError } from '../errors.js';
import * as policy from '../policy/index.js';

export interface Reservation {
  id: string;
  book_id: string;
  member_id: string;
  queued_at: string;
  status: 'waiting' | 'notified' | 'expired' | 'fulfilled' | 'cancelled';
  notified_at: string | null;
  expires_at: string | null;
}

export interface ReservationWithBook extends Reservation {
  book_title: string;
  queue_position: number;
}

export interface CreateReservationInput {
  member_id: string;
  book_id: string;
}

function hasActiveLoanForBook(db: DatabaseInstance, memberId: string, bookId: string): boolean {
  const stmt = db.prepare(`
    SELECT id FROM loans 
    WHERE member_id = ? AND book_id = ? AND returned_at IS NULL
  `);
  return !!stmt.get(memberId, bookId);
}

function hasActiveReservationForBook(db: DatabaseInstance, memberId: string, bookId: string): boolean {
  const stmt = db.prepare(`
    SELECT id FROM reservations 
    WHERE member_id = ? AND book_id = ? AND status IN ('waiting', 'notified')
  `);
  return !!stmt.get(memberId, bookId);
}

export function createReservation(db: DatabaseInstance, input: CreateReservationInput): Reservation {
  // Check member exists
  const memberStmt = db.prepare('SELECT id FROM members WHERE id = ?');
  if (!memberStmt.get(input.member_id)) {
    throw new NotFoundError('Member');
  }
  
  // Check book exists
  const bookStmt = db.prepare('SELECT id FROM books WHERE id = ?');
  if (!bookStmt.get(input.book_id)) {
    throw new NotFoundError('Book');
  }
  
  // Check member doesn't have this book on loan
  if (hasActiveLoanForBook(db, input.member_id, input.book_id)) {
    throw new ConflictError('Member already has this book on loan');
  }
  
  // Check for duplicate reservation
  if (hasActiveReservationForBook(db, input.member_id, input.book_id)) {
    throw new ConflictError('Duplicate reservation');
  }
  
  const id = crypto.randomUUID();
  const queuedAt = new Date();
  
  const insertStmt = db.prepare(`
    INSERT INTO reservations (id, book_id, member_id, queued_at, status)
    VALUES (?, ?, ?, ?, 'waiting')
  `);
  
  insertStmt.run(id, input.book_id, input.member_id, queuedAt.toISOString());
  
  return {
    id,
    book_id: input.book_id,
    member_id: input.member_id,
    queued_at: queuedAt.toISOString(),
    status: 'waiting',
    notified_at: null,
    expires_at: null
  };
}

export function getReservationsForMember(db: DatabaseInstance, memberId: string): ReservationWithBook[] {
  const stmt = db.prepare(`
    SELECT 
      r.id,
      r.book_id,
      r.member_id,
      r.queued_at,
      r.status,
      r.notified_at,
      r.expires_at,
      b.title as book_title,
      (
        SELECT COUNT(*) + 1
        FROM reservations r2
        WHERE r2.book_id = r.book_id 
        AND r2.status IN ('waiting', 'notified')
        AND r2.queued_at < r.queued_at
      ) as queue_position
    FROM reservations r
    JOIN books b ON r.book_id = b.id
    WHERE r.member_id = ? AND r.status IN ('waiting', 'notified')
    ORDER BY r.queued_at
  `);
  
  return stmt.all(memberId) as ReservationWithBook[];
}

export function findNextWaitingReservation(db: DatabaseInstance, bookId: string): 
  { id: string; member_id: string } | undefined {
  const stmt = db.prepare(`
    SELECT id, member_id 
    FROM reservations 
    WHERE book_id = ? AND status = 'waiting'
    ORDER BY queued_at
    LIMIT 1
  `);
  return stmt.get(bookId) as { id: string; member_id: string } | undefined;
}

export function notifyReservation(db: DatabaseInstance, reservationId: string): void {
  const notifiedAt = new Date();
  const expiresAt = policy.calculateReservationExpiry(notifiedAt);
  
  const stmt = db.prepare(`
    UPDATE reservations 
    SET status = 'notified', notified_at = ?, expires_at = ?
    WHERE id = ?
  `);
  
  stmt.run(notifiedAt.toISOString(), expiresAt.toISOString(), reservationId);
}

export function fulfillReservation(db: DatabaseInstance, reservationId: string): void {
  const stmt = db.prepare(`
    UPDATE reservations 
    SET status = 'fulfilled'
    WHERE id = ?
  `);
  stmt.run(reservationId);
}

export function cancelReservation(db: DatabaseInstance, reservationId: string): void {
  const checkStmt = db.prepare(`
    SELECT status FROM reservations WHERE id = ?
  `);
  const reservation = checkStmt.get(reservationId) as { status: string } | undefined;
  
  if (!reservation) {
    throw new NotFoundError('Reservation');
  }
  
  if (reservation.status === 'fulfilled' || reservation.status === 'expired') {
    throw new ConflictError('Cannot cancel fulfilled or expired reservation');
  }
  
  const stmt = db.prepare(`
    UPDATE reservations 
    SET status = 'cancelled'
    WHERE id = ?
  `);
  stmt.run(reservationId);
}

export function expireStaleReservations(db: DatabaseInstance): void {
  const now = new Date().toISOString();
  
  // Find expired reservations
  const findStmt = db.prepare(`
    SELECT id, book_id 
    FROM reservations 
    WHERE status = 'notified' AND expires_at < ?
  `);
  
  const expired = findStmt.all(now) as { id: string; book_id: string }[];
  
  for (const reservation of expired) {
    // Mark as expired
    const expireStmt = db.prepare(`
      UPDATE reservations 
      SET status = 'expired'
      WHERE id = ?
    `);
    expireStmt.run(reservation.id);
    
    // Notify next in queue
    const next = findNextWaitingReservation(db, reservation.book_id);
    if (next) {
      notifyReservation(db, next.id);
    }
  }
}

export function getReservationQueueForBook(db: DatabaseInstance, bookId: string): 
  Array<{ member_id: string; status: string; expires_at: string | null }> {
  const stmt = db.prepare(`
    SELECT member_id, status, expires_at
    FROM reservations
    WHERE book_id = ? AND status IN ('waiting', 'notified')
    ORDER BY queued_at
  `);
  return stmt.all(bookId) as Array<{ member_id: string; status: string; expires_at: string | null }>;
}
