import { randomUUID } from "node:crypto";

import { ConflictError } from "../errors";
import type { Db } from "./dbTypes";
import type { Book, ReservationRow } from "./types";
import { getBookStats, normalizeIsbn, queuePosition, toBook } from "./serviceHelpers";

type BookStatsRow = {
  id: string;
  title: string;
  author: string;
  isbn: string;
  total_copies: number;
  active_loans: number;
  notified_reservations: number;
  reservation_queue_depth: number;
};

export type BookDetail = Book & {
  selected_member_reservation: (ReservationRow & { queue_position: number | null }) | null;
};

export function listBooks(db: Db): Book[] {
  const rows = db
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
      ORDER BY lower(b.title), b.title
    `
    )
    .all() as BookStatsRow[];
  return rows.map(toBook);
}

export function getBook(db: Db, bookId: string, memberId?: string): BookDetail {
  const book = getBookStats(db, bookId);
  const reservation = memberId
    ? (db
        .prepare(
          `
          SELECT id, book_id, member_id, queued_at, status, notified_at, expires_at
          FROM reservations
          WHERE book_id = ? AND member_id = ? AND status IN ('waiting', 'notified')
          ORDER BY queued_at ASC
          LIMIT 1
        `
        )
        .get(bookId, memberId) as ReservationRow | undefined)
    : undefined;
  return {
    ...book,
    selected_member_reservation: reservation ? { ...reservation, queue_position: queuePosition(db, reservation) } : null
  };
}

export function createBook(
  db: Db,
  input: { title: string; author: string; isbn: string; total_copies: number }
): Book {
  const isbnDigits = normalizeIsbn(input.isbn);
  const existing = db.prepare("SELECT id FROM books WHERE isbn_digits = ?").get(isbnDigits);
  if (existing) {
    throw new ConflictError("ISBN already exists");
  }
  const id = randomUUID();
  db.prepare(
    "INSERT INTO books (id, title, author, isbn, isbn_digits, total_copies) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, input.title.trim(), input.author.trim(), input.isbn.trim(), isbnDigits, input.total_copies);
  return getBookStats(db, id);
}
