import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb } from '../db.js';
import * as bookService from './bookService.js';
import * as memberService from './memberService.js';
import * as loanService from './loanService.js';
import * as reservationService from './reservationService.js';
import * as fineService from './fineService.js';
import { v4 as uuid } from 'uuid';
import type Database from 'better-sqlite3';

function setupTestDb(): Database.Database {
  const db = createTestDb();
  return db;
}

function insertMember(db: Database.Database, overrides: Partial<{ id: string; name: string; email: string; status: string }> = {}) {
  const id = overrides.id ?? uuid();
  const name = overrides.name ?? 'Test User';
  const email = overrides.email ?? `${id.slice(0, 8)}@test.com`;
  const status = overrides.status ?? 'active';
  db.prepare('INSERT INTO members (id, name, email, member_since, status) VALUES (?, ?, ?, ?, ?)')
    .run(id, name, email, '2025-01-01', status);
  return { id, name, email, status };
}

function insertBook(db: Database.Database, overrides: Partial<{ id: string; title: string; author: string; isbn: string; total_copies: number }> = {}) {
  const id = overrides.id ?? uuid();
  const title = overrides.title ?? 'Test Book';
  const author = overrides.author ?? 'Test Author';
  const isbn = overrides.isbn ?? `${Math.random().toString().slice(2, 15)}`;
  const total_copies = overrides.total_copies ?? 3;
  db.prepare('INSERT INTO books (id, title, author, isbn, total_copies) VALUES (?, ?, ?, ?, ?)')
    .run(id, title, author, isbn, total_copies);
  return { id, title, author, isbn, total_copies };
}

describe('bookService', () => {
  let db: Database.Database;

  beforeEach(() => { db = setupTestDb(); });
  afterEach(() => { db.close(); });

  it('lists books sorted by title case-insensitive', () => {
    insertBook(db, { title: 'Zebra Book' });
    insertBook(db, { title: 'apple book' });
    insertBook(db, { title: 'Mango book' });

    const books = bookService.listBooks(db);
    expect(books.map(b => b.title)).toEqual(['apple book', 'Mango book', 'Zebra Book']);
  });

  it('computes available_copies correctly', () => {
    const book = insertBook(db, { total_copies: 3 });
    const member = insertMember(db);
    const loanId = uuid();
    const now = new Date();
    const due = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    db.prepare('INSERT INTO loans (id, book_id, member_id, borrowed_at, due_at) VALUES (?, ?, ?, ?, ?)')
      .run(loanId, book.id, member.id, now.toISOString(), due.toISOString());

    const books = bookService.listBooks(db);
    const b = books.find(b => b.id === book.id);
    expect(b?.available_copies).toBe(2);
    expect(b?.total_copies).toBe(3);
  });

  it('AC-1.2: getBook returns queue depth', () => {
    const book = insertBook(db);
    const m1 = insertMember(db);
    const m2 = insertMember(db);
    db.prepare('INSERT INTO reservations (id, book_id, member_id, queued_at, status) VALUES (?, ?, ?, ?, ?)')
      .run(uuid(), book.id, m1.id, '2025-01-01T00:00:00Z', 'waiting');
    db.prepare('INSERT INTO reservations (id, book_id, member_id, queued_at, status) VALUES (?, ?, ?, ?, ?)')
      .run(uuid(), book.id, m2.id, '2025-01-02T00:00:00Z', 'notified');

    const depth = bookService.getBookReservationQueueDepth(db, book.id);
    expect(depth).toBe(2);
  });

  it('AC-2.1: creates a book', () => {
    const book = bookService.createBook(db, {
      title: 'New Book', author: 'Author', isbn: '978-1234567890', total_copies: 2,
    });
    expect(book.title).toBe('New Book');
    expect(book.available_copies).toBe(2);
  });

  it('AC-2.2: rejects duplicate ISBN', () => {
    bookService.createBook(db, { title: 'B1', author: 'A1', isbn: '978-1234567890', total_copies: 1 });
    expect(() => bookService.createBook(db, { title: 'B2', author: 'A2', isbn: '978-1234567890', total_copies: 1 }))
      .toThrow('ISBN already exists');
  });

  it('getBook returns null for non-existent id', () => {
    expect(bookService.getBook(db, uuid())).toBeNull();
  });
});

describe('memberService', () => {
  let db: Database.Database;

  beforeEach(() => { db = setupTestDb(); });
  afterEach(() => { db.close(); });

  it('creates a member', () => {
    const member = memberService.createMember(db, { name: 'Alice', email: 'alice@test.com' });
    expect(member.name).toBe('Alice');
    expect(member.status).toBe('active');
  });

  it('AC-2.4: rejects duplicate email', () => {
    memberService.createMember(db, { name: 'Alice', email: 'alice@test.com' });
    expect(() => memberService.createMember(db, { name: 'Bob', email: 'alice@test.com' }))
      .toThrow('Email already exists');
  });

  it('AC-6.1: includes unpaid_fines_cents', () => {
    const member = insertMember(db);
    const book = insertBook(db);
    const loanId = uuid();
    const now = new Date();
    db.prepare('INSERT INTO loans (id, book_id, member_id, borrowed_at, due_at) VALUES (?, ?, ?, ?, ?)')
      .run(loanId, book.id, member.id, now.toISOString(), now.toISOString());
    db.prepare('INSERT INTO fines (id, member_id, loan_id, amount_cents) VALUES (?, ?, ?, ?)')
      .run(uuid(), member.id, loanId, 500);

    const m = memberService.getMember(db, member.id);
    expect(m?.unpaid_fines_cents).toBe(500);
  });

  it('returns null for nonexistent member', () => {
    expect(memberService.getMember(db, uuid())).toBeNull();
  });
});

describe('loanService', () => {
  let db: Database.Database;
  let member: ReturnType<typeof insertMember>;
  let book: ReturnType<typeof insertBook>;

  beforeEach(() => {
    db = setupTestDb();
    member = insertMember(db);
    book = insertBook(db, { total_copies: 2 });
  });
  afterEach(() => { db.close(); });

  it('AC-3.1: creates an active loan', () => {
    const loan = loanService.borrowBook(db, { memberId: member.id, bookId: book.id });
    expect(loan.returned_at).toBeNull();
    expect(loan.due_at).toBeTruthy();

    const b = bookService.getBook(db, book.id);
    expect(b?.available_copies).toBe(1);
  });

  it('AC-3.2: rejects 6th loan', () => {
    for (let i = 0; i < 5; i++) {
      const b = insertBook(db);
      loanService.borrowBook(db, { memberId: member.id, bookId: b.id });
    }
    const extraBook = insertBook(db);
    expect(() => loanService.borrowBook(db, { memberId: member.id, bookId: extraBook.id }))
      .toThrow('Loan limit reached');
  });

  it('AC-3.3: rejects suspended member', () => {
    const suspended = insertMember(db, { status: 'suspended' });
    expect(() => loanService.borrowBook(db, { memberId: suspended.id, bookId: book.id }))
      .toThrow('Member is suspended');
  });

  it('AC-3.4: rejects if unpaid fines > $5', () => {
    const m = insertMember(db);
    const b = insertBook(db);
    const loanId = uuid();
    const now = new Date();
    db.prepare('INSERT INTO loans (id, book_id, member_id, borrowed_at, due_at, returned_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(loanId, b.id, m.id, now.toISOString(), now.toISOString(), now.toISOString());
    db.prepare('INSERT INTO fines (id, member_id, loan_id, amount_cents) VALUES (?, ?, ?, ?)')
      .run(uuid(), m.id, loanId, 501);

    const newBook = insertBook(db);
    expect(() => loanService.borrowBook(db, { memberId: m.id, bookId: newBook.id }))
      .toThrow('Outstanding fines exceed limit');
  });

  it('AC-3.5: rejects when no copies available', () => {
    const b = insertBook(db, { total_copies: 1 });
    loanService.borrowBook(db, { memberId: member.id, bookId: b.id });
    const m2 = insertMember(db);
    expect(() => loanService.borrowBook(db, { memberId: m2.id, bookId: b.id }))
      .toThrow('No copies available — reserve instead');
  });

  it('AC-4.1: marks loan returned', () => {
    const loan = loanService.borrowBook(db, { memberId: member.id, bookId: book.id });
    const result = loanService.returnBook(db, loan.id);
    expect(result.loan.returned_at).toBeTruthy();

    const b = bookService.getBook(db, book.id);
    expect(b?.available_copies).toBe(2);
  });

  it('AC-4.2: creates fine for late return', () => {
    const loan = loanService.borrowBook(db, { memberId: member.id, bookId: book.id });
    // Manually set due_at to 2 days in the past
    const pastDue = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare('UPDATE loans SET due_at = ? WHERE id = ?').run(pastDue, loan.id);

    const result = loanService.returnBook(db, loan.id);
    expect(result.fineCreated).toBe(true);

    const fines = db.prepare('SELECT * FROM fines WHERE loan_id = ?').all(loan.id);
    expect(fines.length).toBe(1);
    expect((fines[0] as { amount_cents: number }).amount_cents).toBeGreaterThan(0);
  });

  it('AC-4.3: rejects returning already-returned loan', () => {
    const loan = loanService.borrowBook(db, { memberId: member.id, bookId: book.id });
    loanService.returnBook(db, loan.id);
    expect(() => loanService.returnBook(db, loan.id))
      .toThrow('Loan already returned');
  });

  it('AC-5.4: notified reservation fulfilled on borrow', () => {
    // Book with 1 copy: borrow -> reserve -> return (notify) -> head can borrow, others cannot
    const b = insertBook(db, { total_copies: 1 });

    // Member borrows -> 0 available
    loanService.borrowBook(db, { memberId: member.id, bookId: b.id });

    // m2 reserves
    const m2 = insertMember(db);
    reservationService.createReservation(db, { memberId: m2.id, bookId: b.id });

    // Return -> m2 gets notified (available_copies stays 0 due to notified reservation)
    const loan = db.prepare('SELECT * FROM loans WHERE book_id = ? AND returned_at IS NULL').get(b.id) as { id: string };
    loanService.returnBook(db, loan.id);

    // Verify m2 is notified
    const m2res = db.prepare("SELECT * FROM reservations WHERE book_id = ? AND member_id = ? AND status = 'notified'")
      .get(b.id, m2.id) as { id: string; member_id: string; status: string } | undefined;
    expect(m2res).toBeTruthy();

    // Other member (original member) tries to borrow -> should be rejected
    expect(() => loanService.borrowBook(db, { memberId: member.id, bookId: b.id }))
      .toThrow('Book is reserved for another member');

    // m2 borrows -> should succeed
    const m2loan = loanService.borrowBook(db, { memberId: m2.id, bookId: b.id });
    expect(m2loan.returned_at).toBeNull();

    // Reservation should be fulfilled
    expect(m2res).toBeTruthy();
    const updatedRes = db.prepare('SELECT * FROM reservations WHERE id = ?').get(m2res!.id) as { status: string };
    expect(updatedRes.status).toBe('fulfilled');
  });

  it('rejects if member already has active loan for book', () => {
    const b2 = insertBook(db, { total_copies: 2 });
    loanService.borrowBook(db, { memberId: member.id, bookId: b2.id });
    expect(() => loanService.borrowBook(db, { memberId: member.id, bookId: b2.id }))
      .toThrow('Member already has this book on loan');
  });

  it('rejects borrowBook for non-existent member', () => {
    expect(() => loanService.borrowBook(db, { memberId: uuid(), bookId: book.id }))
      .toThrow('Member not found');
  });

  it('rejects borrowBook for non-existent book', () => {
    expect(() => loanService.borrowBook(db, { memberId: member.id, bookId: uuid() }))
      .toThrow('Book not found');
  });

  it('rejects returnBook for non-existent loan', () => {
    expect(() => loanService.returnBook(db, uuid()))
      .toThrow('Loan not found');
  });

  it('on-time return has fineCreated=false', () => {
    const b = insertBook(db);
    const m = insertMember(db);
    const loan = loanService.borrowBook(db, { memberId: m.id, bookId: b.id });
    const result = loanService.returnBook(db, loan.id);
    expect(result.fineCreated).toBe(false);
  });

  it('AC-4.4: return notifies head waiting reservation via loanService', () => {
    const b = insertBook(db, { total_copies: 1 });
    loanService.borrowBook(db, { memberId: member.id, bookId: b.id });
    const m2 = insertMember(db);
    reservationService.createReservation(db, { memberId: m2.id, bookId: b.id });

    const loan = db.prepare('SELECT * FROM loans WHERE book_id = ? AND returned_at IS NULL').get(b.id) as { id: string };
    loanService.returnBook(db, loan.id);

    const res = db.prepare("SELECT * FROM reservations WHERE book_id = ? AND member_id = ? AND status = 'notified'")
      .get(b.id, m2.id) as { status: string; notified_at: string; expires_at: string } | undefined;
    expect(res).toBeTruthy();
    expect(res!.status).toBe('notified');
  });
});

describe('reservationService', () => {
  let db: Database.Database;
  let member: ReturnType<typeof insertMember>;
  let book: ReturnType<typeof insertBook>;

  beforeEach(() => {
    db = setupTestDb();
    member = insertMember(db);
    book = insertBook(db, { total_copies: 1 });
  });
  afterEach(() => { db.close(); });

  it('AC-5.1: creates a reservation', () => {
    const res = reservationService.createReservation(db, { memberId: member.id, bookId: book.id });
    expect(res.status).toBe('waiting');
    expect(res.queued_at).toBeTruthy();
  });

  it('AC-5.2: rejects if member has active loan for book', () => {
    // Borrow first
    loanService.borrowBook(db, { memberId: member.id, bookId: book.id });
    expect(() => reservationService.createReservation(db, { memberId: member.id, bookId: book.id }))
      .toThrow('Member already has this book on loan');
  });

  it('AC-5.3: rejects duplicate reservation', () => {
    reservationService.createReservation(db, { memberId: member.id, bookId: book.id });
    expect(() => reservationService.createReservation(db, { memberId: member.id, bookId: book.id }))
      .toThrow('Duplicate reservation');
  });

  it('AC-4.4: return notifies head waiting reservation', () => {
    const b = insertBook(db, { total_copies: 1 });
    loanService.borrowBook(db, { memberId: member.id, bookId: b.id });

    const m2 = insertMember(db);
    reservationService.createReservation(db, { memberId: m2.id, bookId: b.id });

    const loan = db.prepare('SELECT * FROM loans WHERE book_id = ? AND returned_at IS NULL').get(b.id) as { id: string };
    loanService.returnBook(db, loan.id);

    const res = db.prepare("SELECT * FROM reservations WHERE book_id = ? AND status = 'notified'").get(b.id) as { status: string; notified_at: string; expires_at: string } | undefined;
    expect(res).toBeTruthy();
    expect(res?.status).toBe('notified');
    expect(res?.notified_at).toBeTruthy();
    expect(res?.expires_at).toBeTruthy();
  });

  it('AC-5.5: expireStaleReservations expires stale and notifies next', () => {
    const b = insertBook(db, { total_copies: 1 });
    loanService.borrowBook(db, { memberId: member.id, bookId: b.id });

    const m2 = insertMember(db);
    const m3 = insertMember(db);

    reservationService.createReservation(db, { memberId: m2.id, bookId: b.id });
    reservationService.createReservation(db, { memberId: m3.id, bookId: b.id });

    // Simulate m2 being notified with expired time
    const expiredAt = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    db.prepare("UPDATE reservations SET status = 'notified', notified_at = ?, expires_at = ? WHERE member_id = ? AND book_id = ?")
      .run(new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString(), expiredAt, m2.id, b.id);

    const count = reservationService.expireStaleReservations(db);
    expect(count).toBe(1);

    const m2res = db.prepare('SELECT * FROM reservations WHERE member_id = ? AND book_id = ?').get(m2.id, b.id) as { status: string };
    expect(m2res.status).toBe('expired');

    // Next should be notified
    const m3res = db.prepare("SELECT * FROM reservations WHERE member_id = ? AND book_id = ?").get(m3.id, b.id) as { status: string; notified_at: string } | undefined;
    expect(m3res?.status).toBe('notified');
  });

  it('cancelReservation cancels a waiting reservation', () => {
    const res = reservationService.createReservation(db, { memberId: member.id, bookId: book.id });
    const cancelled = reservationService.cancelReservation(db, res.id);
    expect(cancelled.status).toBe('cancelled');
  });

  it('cancelReservation rejects non-existent id', () => {
    expect(() => reservationService.cancelReservation(db, uuid()))
      .toThrow('Reservation not found');
  });

  it('cancelReservation rejects already fulfilled reservation', () => {
    const res = reservationService.createReservation(db, { memberId: member.id, bookId: book.id });
    db.prepare("UPDATE reservations SET status = 'fulfilled' WHERE id = ?").run(res.id);
    expect(() => reservationService.cancelReservation(db, res.id))
      .toThrow('Reservation cannot be cancelled');
  });

  it('cancelReservation rejects already cancelled reservation', () => {
    const res = reservationService.createReservation(db, { memberId: member.id, bookId: book.id });
    reservationService.cancelReservation(db, res.id);
    expect(() => reservationService.cancelReservation(db, res.id))
      .toThrow('Reservation cannot be cancelled');
  });

  it('getBookQueuePosition returns correct position', () => {
    const b = insertBook(db, { total_copies: 1 });
    const m2 = insertMember(db);
    const m3 = insertMember(db);

    reservationService.createReservation(db, { memberId: member.id, bookId: b.id });
    reservationService.createReservation(db, { memberId: m2.id, bookId: b.id });
    reservationService.createReservation(db, { memberId: m3.id, bookId: b.id });

    const pos1 = reservationService.getBookQueuePosition(db, b.id, member.id);
    expect(pos1.position).toBe(1);
    expect(pos1.hasNotification).toBe(false);
    const pos3 = reservationService.getBookQueuePosition(db, b.id, m3.id);
    expect(pos3.position).toBe(3);
  });

  it('getBookQueuePosition returns null for non-reserved member', () => {
    const b = insertBook(db, { total_copies: 1 });
    const result = reservationService.getBookQueuePosition(db, b.id, member.id);
    expect(result.position).toBeNull();
    expect(result.hasNotification).toBe(false);
  });

  it('getBookQueuePosition returns notification info for notified reservation', () => {
    const b = insertBook(db, { total_copies: 1 });
    reservationService.createReservation(db, { memberId: member.id, bookId: b.id });
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    db.prepare("UPDATE reservations SET status = 'notified', notified_at = ?, expires_at = ? WHERE member_id = ? AND book_id = ?")
      .run(now.toISOString(), expiresAt.toISOString(), member.id, b.id);

    const result = reservationService.getBookQueuePosition(db, b.id, member.id);
    expect(result.hasNotification).toBe(true);
    expect(result.position).toBe(1);
    expect(result.expiresIn).toBeGreaterThan(0);
  });

  it('getBookQueuePosition returns expiresIn of 0 for expired notification', () => {
    const b = insertBook(db, { total_copies: 1 });
    reservationService.createReservation(db, { memberId: member.id, bookId: b.id });
    const pastExpiry = new Date(Date.now() - 1000);
    db.prepare("UPDATE reservations SET status = 'notified', notified_at = ?, expires_at = ? WHERE member_id = ? AND book_id = ?")
      .run(new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString(), pastExpiry.toISOString(), member.id, b.id);

    const result = reservationService.getBookQueuePosition(db, b.id, member.id);
    expect(result.hasNotification).toBe(true);
    expect(result.expiresIn).toBe(0);
  });
});

describe('fineService', () => {
  let db: Database.Database;

  beforeEach(() => { db = setupTestDb(); });
  afterEach(() => { db.close(); });

  it('AC-6.2: pays a fine', () => {
    const member = insertMember(db);
    const book = insertBook(db);
    const loanId = uuid();
    const now = new Date();
    db.prepare('INSERT INTO loans (id, book_id, member_id, borrowed_at, due_at) VALUES (?, ?, ?, ?, ?)')
      .run(loanId, book.id, member.id, now.toISOString(), now.toISOString());
    const fineId = uuid();
    db.prepare('INSERT INTO fines (id, member_id, loan_id, amount_cents) VALUES (?, ?, ?, ?)')
      .run(fineId, member.id, loanId, 500);

    const fine = fineService.payFine(db, fineId);
    expect(fine.paid_at).toBeTruthy();
  });

  it('AC-6.3: rejects paying already-paid fine', () => {
    const member = insertMember(db);
    const book = insertBook(db);
    const loanId = uuid();
    const now = new Date();
    db.prepare('INSERT INTO loans (id, book_id, member_id, borrowed_at, due_at) VALUES (?, ?, ?, ?, ?)')
      .run(loanId, book.id, member.id, now.toISOString(), now.toISOString());
    const fineId = uuid();
    db.prepare('INSERT INTO fines (id, member_id, loan_id, amount_cents, paid_at) VALUES (?, ?, ?, ?, ?)')
      .run(fineId, member.id, loanId, 500, new Date().toISOString());

    expect(() => fineService.payFine(db, fineId)).toThrow('Fine already paid');
  });

  it('rejects paying non-existent fine', () => {
    expect(() => fineService.payFine(db, uuid())).toThrow('Fine not found');
  });
});
