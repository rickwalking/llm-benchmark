import type { Db } from "./dbTypes";
import type { Book, BookRow, MemberRow, ReservationRow } from "./types";
import { NotFoundError } from "../errors";

type BookStatsRow = BookRow & {
  active_loans: number;
  notified_reservations: number;
  reservation_queue_depth: number;
};

export function normalizeIsbn(isbn: string): string {
  return isbn.trim().replaceAll("-", "");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function toBook(row: BookStatsRow): Book {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    isbn: row.isbn,
    total_copies: row.total_copies,
    available_copies: Math.max(row.total_copies - row.active_loans - row.notified_reservations, 0),
    reservation_queue_depth: row.reservation_queue_depth
  };
}

export function getBookStats(db: Db, bookId: string): Book {
  const row = db
    .prepare(
      `
      SELECT b.id, b.title, b.author, b.isbn, b.total_copies,
        COALESCE(active.count, 0) AS active_loans,
        COALESCE(notified.count, 0) AS notified_reservations,
        COALESCE(queue.count, 0) AS reservation_queue_depth
      FROM books b
      LEFT JOIN (
        SELECT book_id, COUNT(*) AS count FROM loans WHERE returned_at IS NULL GROUP BY book_id
      ) active ON active.book_id = b.id
      LEFT JOIN (
        SELECT book_id, COUNT(*) AS count FROM reservations WHERE status = 'notified' GROUP BY book_id
      ) notified ON notified.book_id = b.id
      LEFT JOIN (
        SELECT book_id, COUNT(*) AS count FROM reservations
        WHERE status IN ('waiting', 'notified') GROUP BY book_id
      ) queue ON queue.book_id = b.id
      WHERE b.id = ?
    `
    )
    .get(bookId) as BookStatsRow | undefined;
  if (!row) {
    throw new NotFoundError("Book not found");
  }
  return toBook(row);
}

export function getMemberRow(db: Db, memberId: string): MemberRow {
  const member = db.prepare("SELECT id, name, email, member_since, status FROM members WHERE id = ?").get(memberId) as
    | MemberRow
    | undefined;
  if (!member) {
    throw new NotFoundError("Member not found");
  }
  return member;
}

export function getLoanCount(db: Db, memberId: string): number {
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM loans WHERE member_id = ? AND returned_at IS NULL")
    .get(memberId) as { count: number };
  return row.count;
}

export function getUnpaidFinesCents(db: Db, memberId: string): number {
  const row = db
    .prepare("SELECT COALESCE(SUM(amount_cents), 0) AS total FROM fines WHERE member_id = ? AND paid_at IS NULL")
    .get(memberId) as { total: number };
  return row.total;
}

export function getReservationsForBook(db: Db, bookId: string, status?: string): ReservationRow[] {
  const whereStatus = status ? "AND status = ?" : "";
  const params = status ? [bookId, status] : [bookId];
  return db
    .prepare(
      `SELECT id, book_id, member_id, queued_at, status, notified_at, expires_at
       FROM reservations
       WHERE book_id = ? ${whereStatus}
       ORDER BY queued_at ASC, id ASC`
    )
    .all(...params) as ReservationRow[];
}

export function queuePosition(db: Db, reservation: ReservationRow): number | null {
  if (reservation.status !== "waiting" && reservation.status !== "notified") {
    return null;
  }
  const row = db
    .prepare(
      `
      SELECT COUNT(*) + 1 AS position
      FROM reservations
      WHERE book_id = ?
        AND status IN ('waiting', 'notified')
        AND (queued_at < ? OR (queued_at = ? AND id < ?))
    `
    )
    .get(reservation.book_id, reservation.queued_at, reservation.queued_at, reservation.id) as { position: number };
  return row.position;
}
