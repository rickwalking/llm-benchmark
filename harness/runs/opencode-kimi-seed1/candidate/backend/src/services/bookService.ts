import type { DatabaseInstance } from '../db/database.js';
import { NotFoundError, ConflictError } from '../errors.js';

export interface Book {
  id: string;
  title: string;
  author: string;
  isbn: string;
  total_copies: number;
  available_copies: number;
}

export interface CreateBookInput {
  title: string;
  author: string;
  isbn: string;
  total_copies: number;
}

export function listBooks(db: DatabaseInstance): Book[] {
  const stmt = db.prepare(`
    SELECT 
      b.id,
      b.title,
      b.author,
      b.isbn,
      b.total_copies,
      b.total_copies - COUNT(l.id) as available_copies
    FROM books b
    LEFT JOIN loans l ON b.id = l.book_id AND l.returned_at IS NULL
    GROUP BY b.id
    ORDER BY LOWER(b.title)
  `);
  
  return stmt.all() as Book[];
}

export function getBook(db: DatabaseInstance, id: string): Book & { queue_depth: number } {
  const bookStmt = db.prepare(`
    SELECT 
      b.id,
      b.title,
      b.author,
      b.isbn,
      b.total_copies,
      b.total_copies - COUNT(l.id) as available_copies
    FROM books b
    LEFT JOIN loans l ON b.id = l.book_id AND l.returned_at IS NULL
    WHERE b.id = ?
    GROUP BY b.id
  `);
  
  const book = bookStmt.get(id) as Book | undefined;
  if (!book) {
    throw new NotFoundError('Book');
  }
  
  const queueStmt = db.prepare(`
    SELECT COUNT(*) as count
    FROM reservations
    WHERE book_id = ? AND status IN ('waiting', 'notified')
  `);
  
  const { count } = queueStmt.get(id) as { count: number };
  
  return {
    ...book,
    queue_depth: count
  };
}

export function createBook(db: DatabaseInstance, input: CreateBookInput): Book {
  // Check for duplicate ISBN
  const checkStmt = db.prepare('SELECT id FROM books WHERE isbn = ?');
  const existing = checkStmt.get(input.isbn);
  if (existing) {
    throw new ConflictError('ISBN already exists');
  }
  
  const id = crypto.randomUUID();
  const insertStmt = db.prepare(`
    INSERT INTO books (id, title, author, isbn, total_copies)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  insertStmt.run(id, input.title, input.author, input.isbn, input.total_copies);
  
  return {
    id,
    title: input.title,
    author: input.author,
    isbn: input.isbn,
    total_copies: input.total_copies,
    available_copies: input.total_copies
  };
}
