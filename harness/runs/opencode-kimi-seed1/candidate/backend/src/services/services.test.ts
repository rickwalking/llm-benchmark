import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import * as bookService from './bookService.js';
import * as memberService from './memberService.js';
import { NotFoundError, ConflictError } from '../errors.js';

let db: Database.Database;

describe('Book Service', () => {
  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE books (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        author TEXT NOT NULL,
        isbn TEXT NOT NULL UNIQUE,
        total_copies INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE loans (
        id TEXT PRIMARY KEY,
        book_id TEXT NOT NULL,
        member_id TEXT NOT NULL,
        borrowed_at DATETIME NOT NULL,
        due_at DATETIME NOT NULL,
        returned_at DATETIME
      );
      CREATE TABLE reservations (
        id TEXT PRIMARY KEY,
        book_id TEXT NOT NULL,
        member_id TEXT NOT NULL,
        queued_at DATETIME NOT NULL,
        status TEXT NOT NULL DEFAULT 'waiting',
        notified_at DATETIME,
        expires_at DATETIME
      );
    `);
  });

  it('creates a book', () => {
    const book = bookService.createBook(db, {
      title: 'Test Book',
      author: 'Test Author',
      isbn: '1234567890',
      total_copies: 3
    });
    expect(book.title).toBe('Test Book');
    expect(book.available_copies).toBe(3);
  });

  it('throws ConflictError for duplicate ISBN', () => {
    bookService.createBook(db, {
      title: 'Book 1',
      author: 'Author',
      isbn: '123',
      total_copies: 1
    });
    expect(() => {
      bookService.createBook(db, {
        title: 'Book 2',
        author: 'Author',
        isbn: '123',
        total_copies: 1
      });
    }).toThrow(ConflictError);
  });

  it('throws NotFoundError for non-existent book', () => {
    expect(() => {
      bookService.getBook(db, 'non-existent');
    }).toThrow(NotFoundError);
  });
});

describe('Member Service', () => {
  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE members (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        member_since DATE NOT NULL,
        status TEXT NOT NULL DEFAULT 'active'
      );
      CREATE TABLE loans (
        id TEXT PRIMARY KEY,
        book_id TEXT NOT NULL,
        member_id TEXT NOT NULL,
        borrowed_at DATETIME NOT NULL,
        due_at DATETIME NOT NULL,
        returned_at DATETIME
      );
      CREATE TABLE fines (
        id TEXT PRIMARY KEY,
        member_id TEXT NOT NULL,
        loan_id TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        paid_at DATETIME
      );
    `);
  });

  it('creates a member', () => {
    const member = memberService.createMember(db, {
      name: 'John Doe',
      email: 'john@example.com'
    });
    expect(member.name).toBe('John Doe');
    expect(member.status).toBe('active');
  });

  it('throws ConflictError for duplicate email', () => {
    memberService.createMember(db, { name: 'John', email: 'john@example.com' });
    expect(() => {
      memberService.createMember(db, { name: 'Jane', email: 'john@example.com' });
    }).toThrow(ConflictError);
  });
});
