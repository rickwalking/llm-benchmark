import { randomUUID } from "node:crypto";

import { ConflictError, NotFoundError } from "../errors";
import { RESERVATION_NOTIFICATION_HOURS, addHours, nextReservationToNotify } from "../policy";
import type { Db } from "./dbTypes";
import type { ReservationRow } from "./types";
import { getBookStats, getMemberRow, getReservationsForBook } from "./serviceHelpers";

export function reserveBook(db: Db, input: { member_id: string; book_id: string }, now = new Date()): ReservationRow {
  getMemberRow(db, input.member_id);
  getBookStats(db, input.book_id);
  const activeLoan = db
    .prepare(
      "SELECT id FROM loans WHERE member_id = ? AND book_id = ? AND returned_at IS NULL LIMIT 1"
    )
    .get(input.member_id, input.book_id);
  if (activeLoan) {
    throw new ConflictError("Member already has this book on loan");
  }
  const duplicate = db
    .prepare(
      `
      SELECT id FROM reservations
      WHERE member_id = ? AND book_id = ? AND status IN ('waiting', 'notified')
      LIMIT 1
    `
    )
    .get(input.member_id, input.book_id);
  if (duplicate) {
    throw new ConflictError("Duplicate reservation");
  }
  const id = randomUUID();
  db.prepare(
    `
    INSERT INTO reservations (id, book_id, member_id, queued_at, status, notified_at, expires_at)
    VALUES (?, ?, ?, ?, 'waiting', NULL, NULL)
  `
  ).run(id, input.book_id, input.member_id, now.toISOString());
  return getReservation(db, id);
}

export function cancelReservation(db: Db, reservationId: string): ReservationRow {
  const reservation = getReservation(db, reservationId);
  if (reservation.status !== "waiting" && reservation.status !== "notified") {
    throw new ConflictError("Reservation cannot be cancelled");
  }
  db.prepare("UPDATE reservations SET status = 'cancelled' WHERE id = ?").run(reservationId);
  return getReservation(db, reservationId);
}

export function expireStaleReservations(db: Db, now = new Date()): { expired: number; notified: number } {
  return db.transaction(() => {
    const stale = db
      .prepare(
        `
        SELECT id, book_id, member_id, queued_at, status, notified_at, expires_at
        FROM reservations
        WHERE status = 'notified' AND expires_at < ?
        ORDER BY expires_at ASC, queued_at ASC
      `
      )
      .all(now.toISOString()) as ReservationRow[];
    const affectedBookIds = new Set(stale.map((reservation) => reservation.book_id));
    for (const reservation of stale) {
      db.prepare("UPDATE reservations SET status = 'expired' WHERE id = ?").run(reservation.id);
    }
    let notified = 0;
    for (const bookId of affectedBookIds) {
      notified += notifyWaitingReservationsForAvailableCopies(db, bookId, now);
    }
    return { expired: stale.length, notified };
  })();
}

export function notifyWaitingReservationsForAvailableCopies(db: Db, bookId: string, now: Date): number {
  let notified = 0;
  while (getBookStats(db, bookId).available_copies > 0) {
    const next = nextReservationToNotify(getReservationsForBook(db, bookId, "waiting"));
    if (!next) {
      break;
    }
    notifyReservation(db, next.id, now);
    notified += 1;
  }
  return notified;
}

export function notifyReservation(db: Db, reservationId: string, now: Date): ReservationRow {
  const notifiedAt = now.toISOString();
  const expiresAt = addHours(now, RESERVATION_NOTIFICATION_HOURS).toISOString();
  db.prepare(
    "UPDATE reservations SET status = 'notified', notified_at = ?, expires_at = ? WHERE id = ? AND status = 'waiting'"
  ).run(notifiedAt, expiresAt, reservationId);
  return getReservation(db, reservationId);
}

export function getReservation(db: Db, reservationId: string): ReservationRow {
  const reservation = db
    .prepare("SELECT id, book_id, member_id, queued_at, status, notified_at, expires_at FROM reservations WHERE id = ?")
    .get(reservationId) as ReservationRow | undefined;
  if (!reservation) {
    throw new NotFoundError("Reservation not found");
  }
  return reservation;
}
