import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import { ConflictError } from '../errors.js';
import { RESERVATION_NOTIFICATION_HOURS, nextReservationToNotify } from '../policy/index.js';
import type { Reservation } from '../types.js';

export function createReservation(
  db: Database.Database,
  data: { memberId: string; bookId: string },
): Reservation {
  const existingLoan = db.prepare(
    'SELECT id FROM loans WHERE member_id = ? AND book_id = ? AND returned_at IS NULL',
  ).get(data.memberId, data.bookId);
  if (existingLoan) {
    throw new ConflictError('Member already has this book on loan');
  }

  const existingReservation = db.prepare(
    "SELECT id FROM reservations WHERE member_id = ? AND book_id = ? AND status IN ('waiting', 'notified')",
  ).get(data.memberId, data.bookId);
  if (existingReservation) {
    throw new ConflictError('Duplicate reservation');
  }

  const id = uuid();
  const queuedAt = new Date().toISOString();

  db.prepare(
    'INSERT INTO reservations (id, book_id, member_id, queued_at, status) VALUES (?, ?, ?, ?, ?)',
  ).run(id, data.bookId, data.memberId, queuedAt, 'waiting');

  return {
    id,
    book_id: data.bookId,
    member_id: data.memberId,
    queued_at: queuedAt,
    status: 'waiting',
    notified_at: null,
    expires_at: null,
  };
}

export function expireStaleReservations(db: Database.Database): number {
  const now = new Date().toISOString();
  let expired = 0;

  const tx = db.transaction(() => {
    const stale = db.prepare(`
      SELECT * FROM reservations
      WHERE status = 'notified' AND expires_at < ?
    `).all(now) as Reservation[];

    for (const res of stale) {
      db.prepare("UPDATE reservations SET status = 'expired' WHERE id = ?").run(res.id);
      expired++;

      const reservations = db.prepare(`
        SELECT * FROM reservations
        WHERE book_id = ? AND status = 'waiting'
        ORDER BY queued_at ASC
      `).all(res.book_id) as Reservation[];

      const next = nextReservationToNotify(reservations);
      if (next) {
        const notifyTime = new Date();
        const expiresAt = new Date(notifyTime.getTime() + RESERVATION_NOTIFICATION_HOURS * 60 * 60 * 1000);
        db.prepare(
          "UPDATE reservations SET status = 'notified', notified_at = ?, expires_at = ? WHERE id = ?",
        ).run(notifyTime.toISOString(), expiresAt.toISOString(), next.id);
      }
    }
  });

  tx();
  return expired;
}

export function cancelReservation(db: Database.Database, id: string): Reservation {
  const reservation = db.prepare("SELECT * FROM reservations WHERE id = ?").get(id) as Reservation | undefined;
  if (!reservation) throw new ConflictError('Reservation not found');
  if (reservation.status !== 'waiting' && reservation.status !== 'notified') {
    throw new ConflictError('Reservation cannot be cancelled');
  }

  db.prepare("UPDATE reservations SET status = 'cancelled' WHERE id = ?").run(id);

  return { ...reservation, status: 'cancelled' };
}

export function getBookQueuePosition(
  db: Database.Database,
  bookId: string,
  memberId: string,
): { position: number | null; hasNotification: boolean; expiresIn: number | null } {
  const reservations = db.prepare(`
    SELECT * FROM reservations
    WHERE book_id = ? AND status IN ('waiting', 'notified')
    ORDER BY queued_at ASC
  `).all(bookId) as Reservation[];

  const myReservation = reservations.find(r => r.member_id === memberId);

  if (!myReservation) {
    return { position: null, hasNotification: false, expiresIn: null };
  }

  if (myReservation.status === 'notified' && myReservation.expires_at) {
    const expiresAt = new Date(myReservation.expires_at).getTime();
    const now = Date.now();
    const expiresIn = Math.max(0, expiresAt - now);
    return { position: 1, hasNotification: true, expiresIn };
  }

  const position = reservations.findIndex(r => r.member_id === memberId) + 1;
  return { position, hasNotification: false, expiresIn: null };
}
