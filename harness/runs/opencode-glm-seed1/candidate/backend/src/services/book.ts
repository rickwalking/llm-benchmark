import Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import { ConflictError, NotFoundError } from '../errors.js';

export interface BookRow {
  id: string;
  title: string;
  author: string;
  isbn: string;
  total_copies: number;
  available_copies: number;
}

export const bookService = {
  list(db: Database.Database): BookRow[] {
    const books = db.prepare(
      `SELECT b.*,
        (b.total_copies - COALESCE((SELECT COUNT(*) FROM loans l WHERE l.book_id = b.id AND l.returned_at IS NULL), 0)) as available_copies
       FROM books b
       ORDER BY LOWER(b.title)`
    ).all() as BookRow[];
    return books;
  },

  get(db: Database.Database, id: string): BookRow & { reservation_queue_depth: number } {
    const book = db.prepare(
      `SELECT b.*,
        (b.total_copies - COALESCE((SELECT COUNT(*) FROM loans l WHERE l.book_id = b.id AND l.returned_at IS NULL), 0)) as available_copies
       FROM books b
       WHERE b.id = ?`
    ).get(id) as BookRow | undefined;

    if (!book) throw new NotFoundError('Book not found');

    const queueDepth = db.prepare(
      `SELECT COUNT(*) as depth FROM reservations
       WHERE book_id = ? AND status IN ('waiting', 'notified')`
    ).get(id) as { depth: number };

    return { ...book, reservation_queue_depth: queueDepth.depth };
  },

  create(db: Database.Database, data: { title: string; author: string; isbn: string; total_copies: number }): BookRow {
    const existing = db.prepare('SELECT id FROM books WHERE isbn = ?').get(data.isbn);
    if (existing) throw new ConflictError('ISBN already exists');

    const id = uuid();
    db.prepare(
      'INSERT INTO books (id, title, author, isbn, total_copies) VALUES (?, ?, ?, ?, ?)'
    ).run(id, data.title, data.author, data.isbn, data.total_copies);

    return bookService.get(db, id);
  },
};