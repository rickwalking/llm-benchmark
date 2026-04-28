import { v4 as uuidv4 } from 'uuid';
import type { DB } from '../db/index.js';
import { ConflictError, NotFoundError } from '../errors.js';
import {
  RESERVATION_NOTIFICATION_HOURS,
  reservationExpiry,
} from '../policy/index.js';
import type { ReservationRow } from '../types.js';

export interface ReservationInput {
  book_id: string;
  member_id: string;
}

export function expireStaleReservations(db: DB): number {
  const nowIso = new Date().toISOString();
  let total = 0;

  const expireStmt = db.prepare(
    "UPDATE reservations SET status = 'expired' WHERE id = ?",
  );
  const promoteStmt = db.prepare(
    "UPDATE reservations SET status = 'notified', notified_at = ?, expires_at = ? WHERE id = ?",
  );

  const tx = db.transaction(() => {
    const stale = db
      .prepare(
        "SELECT id, book_id FROM reservations WHERE status = 'notified' AND expires_at IS NOT NULL AND expires_at < ?",
      )
      .all(nowIso) as Array<Pick<ReservationRow, 'id' | 'book_id'>>;
    for (const reservation of stale) {
      expireStmt.run(reservation.id);
      total += 1;
      const next = db
        .prepare(
          "SELECT id FROM reservations WHERE book_id = ? AND status = 'waiting' ORDER BY queued_at ASC LIMIT 1",
        )
        .get(reservation.book_id) as { id: string } | undefined;
      if (next) {
        const notifiedAt = new Date();
        const expiresAt = reservationExpiry(notifiedAt);
        promoteStmt.run(notifiedAt.toISOString(), expiresAt.toISOString(), next.id);
      }
    }
  });
  tx();

  return total;
}

export function createReservation(
  db: DB,
  input: ReservationInput,
): ReservationRow {
  const book = db.prepare('SELECT id FROM books WHERE id = ?').get(input.book_id);
  if (!book) {
    throw new NotFoundError('Book not found');
  }
  const member = db.prepare('SELECT id FROM members WHERE id = ?').get(input.member_id);
  if (!member) {
    throw new NotFoundError('Member not found');
  }

  const activeLoan = db
    .prepare(
      'SELECT id FROM loans WHERE book_id = ? AND member_id = ? AND returned_at IS NULL',
    )
    .get(input.book_id, input.member_id);
  if (activeLoan) {
    throw new ConflictError('Member already has this book on loan');
  }

  const dupReservation = db
    .prepare(
      "SELECT id FROM reservations WHERE book_id = ? AND member_id = ? AND status IN ('waiting','notified')",
    )
    .get(input.book_id, input.member_id);
  if (dupReservation) {
    throw new ConflictError('Duplicate reservation');
  }

  const id = uuidv4();
  const queuedAt = new Date().toISOString();
  db.prepare(
    "INSERT INTO reservations (id, book_id, member_id, queued_at, status) VALUES (?, ?, ?, ?, 'waiting')",
  ).run(id, input.book_id, input.member_id, queuedAt);

  return {
    id,
    book_id: input.book_id,
    member_id: input.member_id,
    queued_at: queuedAt,
    status: 'waiting',
    notified_at: null,
    expires_at: null,
  };
}

export function cancelReservation(db: DB, id: string): ReservationRow {
  const row = db
    .prepare('SELECT * FROM reservations WHERE id = ?')
    .get(id) as ReservationRow | undefined;
  if (!row) {
    throw new NotFoundError('Reservation not found');
  }
  if (row.status !== 'waiting' && row.status !== 'notified') {
    throw new ConflictError('Reservation is not active');
  }
  const wasNotified = row.status === 'notified';
  db.prepare("UPDATE reservations SET status = 'cancelled' WHERE id = ?").run(id);

  if (wasNotified) {
    promoteNextWaiting(db, row.book_id);
  }

  return { ...row, status: 'cancelled' };
}

export function promoteNextWaiting(db: DB, bookId: string): void {
  const next = db
    .prepare(
      "SELECT id FROM reservations WHERE book_id = ? AND status = 'waiting' ORDER BY queued_at ASC LIMIT 1",
    )
    .get(bookId) as { id: string } | undefined;
  if (!next) return;
  const notifiedAt = new Date();
  const expiresAt = reservationExpiry(notifiedAt);
  db.prepare(
    "UPDATE reservations SET status = 'notified', notified_at = ?, expires_at = ? WHERE id = ?",
  ).run(notifiedAt.toISOString(), expiresAt.toISOString(), next.id);
}

export const NOTIFICATION_WINDOW_HOURS = RESERVATION_NOTIFICATION_HOURS;
