import Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import { ConflictError, NotFoundError } from '../errors.js';

export interface ReservationRow {
  id: string;
  book_id: string;
  member_id: string;
  queued_at: string;
  status: 'waiting' | 'notified' | 'expired' | 'fulfilled' | 'cancelled';
  notified_at: string | null;
  expires_at: string | null;
}

export const reservationService = {
  reserve(db: Database.Database, memberId: string, bookId: string): ReservationRow {
    const member = db.prepare('SELECT * FROM members WHERE id = ?').get(memberId);
    if (!member) throw new NotFoundError('Member not found');

    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId);
    if (!book) throw new NotFoundError('Book not found');

    const activeLoan = db.prepare(
      'SELECT id FROM loans WHERE book_id = ? AND member_id = ? AND returned_at IS NULL'
    ).get(bookId, memberId);
    if (activeLoan) throw new ConflictError('Member already has this book on loan');

    const existingReservation = db.prepare(
      "SELECT id FROM reservations WHERE book_id = ? AND member_id = ? AND status IN ('waiting', 'notified')"
    ).get(bookId, memberId);
    if (existingReservation) throw new ConflictError('Duplicate reservation');

    const id = uuid();
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO reservations (id, book_id, member_id, queued_at, status) VALUES (?, ?, ?, ?, ?)'
    ).run(id, bookId, memberId, now, 'waiting');

    return db.prepare('SELECT * FROM reservations WHERE id = ?').get(id) as ReservationRow;
  },

  cancel(db: Database.Database, reservationId: string): ReservationRow {
    const reservation = db.prepare('SELECT * FROM reservations WHERE id = ?').get(reservationId) as ReservationRow | undefined;
    if (!reservation) throw new NotFoundError('Reservation not found');

    db.prepare(
      "UPDATE reservations SET status = 'cancelled' WHERE id = ?"
    ).run(reservationId);

    return db.prepare('SELECT * FROM reservations WHERE id = ?').get(reservationId) as ReservationRow;
  },

  expireStaleReservations(db: Database.Database): number {
    const now = new Date();
    const staleReservations = db.prepare(
      "SELECT * FROM reservations WHERE status = 'notified' AND expires_at < ?"
    ).all(now.toISOString()) as ReservationRow[];

    let count = 0;
    for (const reservation of staleReservations) {
      db.prepare(
        "UPDATE reservations SET status = 'expired' WHERE id = ?"
      ).run(reservation.id);

      const waitingReservation = db.prepare(
        `SELECT * FROM reservations WHERE book_id = ? AND status = 'waiting' ORDER BY queued_at ASC LIMIT 1`
      ).get(reservation.book_id) as { id: string } | undefined;

      if (waitingReservation) {
        const notifiedAt = new Date();
        const expiresAt = new Date(notifiedAt);
        expiresAt.setHours(expiresAt.getHours() + 48);
        db.prepare(
          "UPDATE reservations SET status = 'notified', notified_at = ?, expires_at = ? WHERE id = ?"
        ).run(notifiedAt.toISOString(), expiresAt.toISOString(), waitingReservation.id);
      }
      count++;
    }
    return count;
  },

  getReservationsForMember(db: Database.Database, memberId: string): ReservationRow[] {
    return db.prepare(
      "SELECT * FROM reservations WHERE member_id = ? AND status IN ('waiting', 'notified') ORDER BY queued_at"
    ).all(memberId) as ReservationRow[];
  },
};