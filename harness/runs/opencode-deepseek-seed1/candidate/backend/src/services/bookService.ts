import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import { ConflictError } from '../errors.js';
import type { Book } from '../types.js';

function availableCopiesSQL(): string {
  return `b.total_copies - COALESCE(l.active_loans, 0) - COALESCE(n.notified_count, 0)`;
}

export function listBooks(db: Database.Database): Book[] {
  const rows = db.prepare(`
    SELECT b.*,
      ${availableCopiesSQL()} as available_copies
    FROM books b
    LEFT JOIN (
      SELECT book_id, COUNT(*) as active_loans
      FROM loans
      WHERE returned_at IS NULL
      GROUP BY book_id
    ) l ON l.book_id = b.id
    LEFT JOIN (
      SELECT book_id, COUNT(*) as notified_count
      FROM reservations
      WHERE status = 'notified'
      GROUP BY book_id
    ) n ON n.book_id = b.id
    ORDER BY b.title COLLATE NOCASE ASC
  `).all() as Book[];
  return rows;
}

export function getBook(db: Database.Database, id: string): Book | null {
  const row = db.prepare(`
    SELECT b.*,
      ${availableCopiesSQL()} as available_copies
    FROM books b
    LEFT JOIN (
      SELECT book_id, COUNT(*) as active_loans
      FROM loans
      WHERE returned_at IS NULL
      GROUP BY book_id
    ) l ON l.book_id = b.id
    LEFT JOIN (
      SELECT book_id, COUNT(*) as notified_count
      FROM reservations
      WHERE status = 'notified'
      GROUP BY book_id
    ) n ON n.book_id = b.id
    WHERE b.id = ?
  `).get(id) as Book | undefined;

  return row ?? null;
}

export function getBookReservationQueueDepth(db: Database.Database, bookId: string): number {
  const row = db.prepare(`
    SELECT COUNT(*) as count
    FROM reservations
    WHERE book_id = ? AND status IN ('waiting', 'notified')
  `).get(bookId) as { count: number };
  return row.count;
}

export function createBook(
  db: Database.Database,
  data: { title: string; author: string; isbn: string; total_copies: number },
): Book {
  const existing = db.prepare('SELECT id FROM books WHERE isbn = ?').get(data.isbn);
  if (existing) {
    throw new ConflictError('ISBN already exists');
  }

  const id = uuid();
  db.prepare(
    'INSERT INTO books (id, title, author, isbn, total_copies) VALUES (?, ?, ?, ?, ?)',
  ).run(id, data.title, data.author, data.isbn, data.total_copies);

  return {
    id,
    title: data.title,
    author: data.author,
    isbn: data.isbn,
    total_copies: data.total_copies,
    available_copies: data.total_copies,
  };
}
