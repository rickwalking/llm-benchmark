import { v4 as uuidv4 } from 'uuid';
import type { DB } from '../db/index.js';
import { ConflictError, NotFoundError } from '../errors.js';
import type { BookDetailView, BookRow, BookView } from '../types.js';

export interface CreateBookInput {
  title: string;
  author: string;
  isbn: string;
  total_copies: number;
}

function activeLoansForBook(db: DB, bookId: string): number {
  const row = db
    .prepare(
      'SELECT COUNT(*) AS n FROM loans WHERE book_id = ? AND returned_at IS NULL',
    )
    .get(bookId) as { n: number };
  return row.n;
}

function notifiedHoldForBook(db: DB, bookId: string): number {
  const row = db
    .prepare(
      "SELECT COUNT(*) AS n FROM reservations WHERE book_id = ? AND status = 'notified'",
    )
    .get(bookId) as { n: number };
  return row.n;
}

function queueDepthForBook(db: DB, bookId: string): number {
  const row = db
    .prepare(
      "SELECT COUNT(*) AS n FROM reservations WHERE book_id = ? AND status IN ('waiting','notified')",
    )
    .get(bookId) as { n: number };
  return row.n;
}

export function listBooks(db: DB): BookView[] {
  const rows = db
    .prepare(
      'SELECT id, title, author, isbn, total_copies FROM books ORDER BY title COLLATE NOCASE ASC',
    )
    .all() as BookRow[];

  return rows.map((row) => {
    const active = activeLoansForBook(db, row.id);
    const notifiedHolds = notifiedHoldForBook(db, row.id);
    const available = Math.max(0, row.total_copies - active - notifiedHolds);
    return { ...row, available_copies: available };
  });
}

export function getBook(db: DB, id: string): BookDetailView {
  const row = db
    .prepare('SELECT id, title, author, isbn, total_copies FROM books WHERE id = ?')
    .get(id) as BookRow | undefined;
  if (!row) {
    throw new NotFoundError('Book not found');
  }
  const active = activeLoansForBook(db, id);
  const notifiedHolds = notifiedHoldForBook(db, id);
  const queueDepth = queueDepthForBook(db, id);
  const available = Math.max(0, row.total_copies - active - notifiedHolds);
  return {
    ...row,
    available_copies: available,
    active_loans: active,
    reservation_queue_depth: queueDepth,
  };
}

export function createBook(db: DB, input: CreateBookInput): BookView {
  const title = input.title.trim();
  const author = input.author.trim();
  const isbn = input.isbn.trim();

  const existing = db.prepare('SELECT id FROM books WHERE isbn = ?').get(isbn);
  if (existing) {
    throw new ConflictError('ISBN already exists');
  }

  const id = uuidv4();
  db.prepare(
    'INSERT INTO books (id, title, author, isbn, total_copies) VALUES (?, ?, ?, ?, ?)',
  ).run(id, title, author, isbn, input.total_copies);

  return {
    id,
    title,
    author,
    isbn,
    total_copies: input.total_copies,
    available_copies: input.total_copies,
  };
}
