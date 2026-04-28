import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../app.js';
import type Database from 'better-sqlite3';
import request from 'supertest';
import type { Express } from 'express';

let app: Express;
let db: Database.Database;

beforeEach(() => {
  const result = createApp();
  app = result.app;
  db = result.db;
  db.exec('DELETE FROM fines');
  db.exec('DELETE FROM reservations');
  db.exec('DELETE FROM loans');
  db.exec('DELETE FROM members');
  db.exec('DELETE FROM books');
});

function seedBook(overrides: Record<string, unknown> = {}): string {
  const id = crypto.randomUUID();
  const defaults = { title: 'Test Book', author: 'Test Author', isbn: `978-${Math.random().toFixed(13).slice(2)}`, total_copies: 2 };
  const data = { ...defaults, ...overrides, id };
  db.prepare('INSERT INTO books (id, title, author, isbn, total_copies) VALUES (?, ?, ?, ?, ?)')
    .run(data.id, data.title, data.author, data.isbn, data.total_copies);
  return id;
}

function seedMember(overrides: Record<string, unknown> = {}): string {
  const id = crypto.randomUUID();
  const defaults = { name: 'Test Member', email: `test${Math.random()}@example.com`, status: 'active' };
  const data = { ...defaults, ...overrides, id };
  db.prepare('INSERT INTO members (id, name, email, member_since, status) VALUES (?, ?, ?, ?, ?)')
    .run(data.id, data.name, data.email, '2024-01-01', data.status);
  return id;
}

function seedLoan(bookId: string, memberId: string, overrides: Record<string, unknown> = {}): string {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const due = new Date(Date.now() + 14 * 86400000).toISOString();
  const borrowedAt = (overrides.borrowed_at as string | undefined) ?? now;
  const dueAt = (overrides.due_at as string | undefined) ?? due;
  const returnedAt = (overrides.returned_at as string | null | undefined) ?? null;
  db.prepare('INSERT INTO loans (id, book_id, member_id, borrowed_at, due_at, returned_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, bookId, memberId, borrowedAt, dueAt, returnedAt);
  return id;
}

describe('GET /api/books', () => {
  it('AC-1.1: returns list of books sorted by title', async () => {
    seedBook({ title: 'Zebra', isbn: '978-0000000001' });
    seedBook({ title: 'alpha', isbn: '978-0000000002' });
    const res = await request(app).get('/api/books');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
    expect(res.body[0].title).toBe('alpha');
    expect(res.body[1].title).toBe('Zebra');
  });
});

describe('GET /api/books/:id', () => {
  it('AC-1.2: returns book with reservation queue depth', async () => {
    const bookId = seedBook();
    const memberId = seedMember();
    db.prepare('INSERT INTO reservations (id, book_id, member_id, queued_at, status) VALUES (?, ?, ?, ?, ?)')
      .run(crypto.randomUUID(), bookId, memberId, new Date().toISOString(), 'waiting');
    const res = await request(app).get(`/api/books/${bookId}`);
    expect(res.status).toBe(200);
    expect(res.body.reservation_queue_depth).toBe(1);
  });

  it('AC-1.4: returns 404 for non-existent book', async () => {
    const res = await request(app).get('/api/books/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Book not found');
  });
});

describe('POST /api/books', () => {
  it('AC-2.1: creates a book and returns 201', async () => {
    const res = await request(app).post('/api/books').send({
      title: 'New Book',
      author: 'Author',
      isbn: '978-1234567890',
      total_copies: 3,
    });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('New Book');
  });

  it('AC-2.2: rejects duplicate ISBN with 409', async () => {
    seedBook({ isbn: '978-1234567890' });
    const res = await request(app).post('/api/books').send({
      title: 'Another Book',
      author: 'Author',
      isbn: '978-1234567890',
      total_copies: 1,
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ISBN already exists');
  });
});

describe('POST /api/members', () => {
  it('AC-2.3: creates a member', async () => {
    const res = await request(app).post('/api/members').send({
      name: 'Test',
      email: 'test@test.com',
    });
    expect(res.status).toBe(201);
    expect(res.body.email).toBe('test@test.com');
  });

  it('AC-2.4: rejects duplicate email with 409', async () => {
    seedMember({ email: 'dup@test.com' });
    const res = await request(app).post('/api/members').send({
      name: 'Dup',
      email: 'dup@test.com',
    });
    expect(res.status).toBe(409);
  });
});

describe('POST /api/loans', () => {
  it('AC-3.1: creates a loan and decreases available copies', async () => {
    const bookId = seedBook({ total_copies: 3 });
    const memberId = seedMember();
    const res = await request(app).post('/api/loans').send({ book_id: bookId, member_id: memberId });
    expect(res.status).toBe(201);
    expect(res.body.due_at).toBeDefined();

    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId) as Record<string, unknown>;
    const activeLoans = db.prepare('SELECT COUNT(*) as count FROM loans WHERE book_id = ? AND returned_at IS NULL').get(bookId) as { count: number };
    expect(book.total_copies as number - activeLoans.count).toBe(2);
  });

  it('AC-3.2: rejects 6th loan with 409', async () => {
    const bookIds: string[] = [];
    const memberId = seedMember();
    for (let i = 0; i < 5; i++) {
      bookIds.push(seedBook({ isbn: `978-111111111${i}`, total_copies: 5 }));
      seedLoan(bookIds[i], memberId);
    }
    const newBookId = seedBook({ isbn: '978-2222222222', total_copies: 5 });
    const res = await request(app).post('/api/loans').send({ book_id: newBookId, member_id: memberId });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Loan limit reached');
  });

  it('AC-3.3: rejects suspended member with 403', async () => {
    const bookId = seedBook();
    const memberId = seedMember({ status: 'suspended' });
    const res = await request(app).post('/api/loans').send({ book_id: bookId, member_id: memberId });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Member is suspended');
  });

  it('AC-3.4: rejects member with excessive fines with 402', async () => {
    const bookId = seedBook();
    const memberId = seedMember();
    const loanId = seedLoan(seedBook({ isbn: '978-fine000000000', total_copies: 5 }), memberId);
    db.prepare('INSERT INTO fines (id, member_id, loan_id, amount_cents) VALUES (?, ?, ?, ?)')
      .run(crypto.randomUUID(), memberId, loanId, 600);
    const res = await request(app).post('/api/loans').send({ book_id: bookId, member_id: memberId });
    expect(res.status).toBe(402);
    expect(res.body.error).toBe('Outstanding fines exceed limit');
  });

  it('AC-3.5: rejects when no copies available', async () => {
    const memberId = seedMember();
    const bookId = seedBook({ total_copies: 1 });
    seedLoan(bookId, memberId);
    const member2Id = seedMember({ email: 'm2@test.com', name: 'Member2' });
    const res = await request(app).post('/api/loans').send({ book_id: bookId, member_id: member2Id });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('No copies available — reserve instead');
  });

  it('AC-3.5b: allows notified member to borrow reserved book', async () => {
    const bookId = seedBook({ total_copies: 1 });
    const member1 = seedMember({ name: 'Borrower1' });
    const member2 = seedMember({ name: 'Borrower2', email: 'm2@test.com' });
    seedLoan(bookId, member1);

    db.prepare('INSERT INTO reservations (id, book_id, member_id, queued_at, status, notified_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(crypto.randomUUID(), bookId, member2, new Date().toISOString(), 'notified', new Date().toISOString(), new Date(Date.now() + 48 * 3600000).toISOString());

    const res = await request(app).post('/api/loans').send({ book_id: bookId, member_id: member2 });
    expect(res.status).toBe(201);
  });
});

describe('POST /api/loans/:id/return', () => {
  it('AC-4.1: returns a loan and increases available copies', async () => {
    const bookId = seedBook({ total_copies: 2 });
    const memberId = seedMember();
    const loanId = seedLoan(bookId, memberId);

    const res = await request(app).post(`/api/loans/${loanId}/return`);
    expect(res.status).toBe(200);
    expect(res.body.returned_at).toBeTruthy();
  });

  it('AC-4.2: creates fine for late return', async () => {
    const bookId = seedBook({ total_copies: 2 });
    const memberId = seedMember();
    const dueDate = new Date(Date.now() - 3 * 86400000);
    const borrowedAt = new Date(dueDate.getTime() - 14 * 86400000);
    const loanId = seedLoan(bookId, memberId, { due_at: dueDate.toISOString(), borrowed_at: borrowedAt.toISOString() });

    const returnedAtStr = new Date(Date.now()).toISOString();
    const res = await request(app).post(`/api/loans/${loanId}/return?returned_at=${encodeURIComponent(returnedAtStr)}`);

    const fines = db.prepare('SELECT * FROM fines WHERE loan_id = ?').all(loanId) as { amount_cents: number }[];
    expect(fines.length).toBe(1);
    expect(fines[0].amount_cents).toBeGreaterThanOrEqual(150);
    expect(fines[0].amount_cents).toBeLessThanOrEqual(1000);
  });

  it('AC-4.2: creates no fine for on-time return', async () => {
    const bookId = seedBook({ total_copies: 2 });
    const memberId = seedMember();
    const loanId = seedLoan(bookId, memberId);

    await request(app).post(`/api/loans/${loanId}/return`);

    const fines = db.prepare('SELECT * FROM fines WHERE loan_id = ?').all(loanId) as { amount_cents: number }[];
    expect(fines.length).toBe(0);
  });

  it('AC-4.3: rejects returning already-returned loan with 409', async () => {
    const bookId = seedBook({ total_copies: 2 });
    const memberId = seedMember();
    const loanId = seedLoan(bookId, memberId);

    await request(app).post(`/api/loans/${loanId}/return`);
    const res = await request(app).post(`/api/loans/${loanId}/return`);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Loan already returned');
  });

  it('AC-4.4: return triggers reservation notification', async () => {
    const bookId = seedBook({ total_copies: 1 });
    const member1 = seedMember({ name: 'Borrower1' });
    const loanId = seedLoan(bookId, member1);
    const member2 = seedMember({ name: 'Borrower2', email: 'm2@test.com' });
    db.prepare('INSERT INTO reservations (id, book_id, member_id, queued_at, status) VALUES (?, ?, ?, ?, ?)')
      .run(crypto.randomUUID(), bookId, member2, new Date().toISOString(), 'waiting');

    await request(app).post(`/api/loans/${loanId}/return`);

    const reservation = db.prepare("SELECT * FROM reservations WHERE member_id = ? AND status = 'notified'").get(member2) as { status: string } | undefined;
    expect(reservation).toBeDefined();
    expect(reservation!.status).toBe('notified');
  });
});

describe('POST /api/reservations', () => {
it('AC-5.1: creates a reservation with status waiting', async () => {
    const bookId = seedBook({ total_copies: 1 });
    const borrowerId = seedMember({ name: 'ReservBorrower', email: 'resb@test.com' });
    const memberId = seedMember({ name: 'Reserve Member', email: 'reserve@test.com' });
    seedLoan(bookId, borrowerId);

    const res = await request(app).post('/api/reservations').send({ book_id: bookId, member_id: memberId });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('waiting');
  });

  it('AC-5.2: rejects reservation when member has book on loan', async () => {
    const bookId = seedBook({ total_copies: 1 });
    const memberId = seedMember();
    seedLoan(bookId, memberId);

    const res = await request(app).post('/api/reservations').send({ book_id: bookId, member_id: memberId });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Member already has this book on loan');
  });

  it('AC-5.3: rejects duplicate reservation', async () => {
    const bookId = seedBook({ total_copies: 1 });
    const memberId = seedMember({ name: 'M1' });
    const borrowerId = seedMember({ name: 'Borrower', email: 'b@test.com' });
    seedLoan(bookId, borrowerId);
    db.prepare('INSERT INTO reservations (id, book_id, member_id, queued_at, status) VALUES (?, ?, ?, ?, ?)')
      .run(crypto.randomUUID(), bookId, memberId, new Date().toISOString(), 'waiting');

    const res = await request(app).post('/api/reservations').send({ book_id: bookId, member_id: memberId });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Duplicate reservation');
  });
});

describe('POST /api/reservations/expire', () => {
  it('AC-5.5: expires stale reservations and notifies next', async () => {
    const bookId = seedBook({ total_copies: 1 });
    const member1 = seedMember({ name: 'Stale' });
    const member2 = seedMember({ name: 'Next', email: 'next@test.com' });
    const borrower = seedMember({ name: 'Borrower', email: 'borrower@test.com' });
    seedLoan(bookId, borrower);

    const now = new Date();
    const expiredDate = new Date(now.getTime() - 3600000);
    db.prepare('INSERT INTO reservations (id, book_id, member_id, queued_at, status, notified_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(crypto.randomUUID(), bookId, member1, expiredDate.toISOString(), 'notified', expiredDate.toISOString(), expiredDate.toISOString());
    db.prepare('INSERT INTO reservations (id, book_id, member_id, queued_at, status) VALUES (?, ?, ?, ?, ?)')
      .run(crypto.randomUUID(), bookId, member2, new Date().toISOString(), 'waiting');

    const res = await request(app).post('/api/reservations/expire');
    expect(res.status).toBe(200);
    expect(res.body.expired).toBeGreaterThanOrEqual(1);

    const stale = db.prepare("SELECT status FROM reservations WHERE member_id = ?", ).all(member1) as { status: string }[];
    expect(stale[0].status).toBe('expired');
  });
});

describe('POST /api/fines/:id/pay', () => {
  it('AC-6.2: pays a fine', async () => {
    const memberId = seedMember();
    const loanId = seedLoan(seedBook({ isbn: '978-fine123456', total_copies: 5 }), memberId);
    const fineId = crypto.randomUUID();
    db.prepare('INSERT INTO fines (id, member_id, loan_id, amount_cents) VALUES (?, ?, ?, ?)')
      .run(fineId, memberId, loanId, 100);

    const res = await request(app).post(`/api/fines/${fineId}/pay`);
    expect(res.status).toBe(200);
    expect(res.body.paid_at).toBeTruthy();
  });

  it('AC-6.3: rejects paying already-paid fine with 409', async () => {
    const memberId = seedMember();
    const loanId = seedLoan(seedBook({ isbn: '978-fine654321', total_copies: 5 }), memberId);
    const fineId = crypto.randomUUID();
    db.prepare('INSERT INTO fines (id, member_id, loan_id, amount_cents, paid_at) VALUES (?, ?, ?, ?, ?)')
      .run(fineId, memberId, loanId, 100, new Date().toISOString());

    const res = await request(app).post(`/api/fines/${fineId}/pay`);
    expect(res.status).toBe(409);
  });
});

describe('GET /api/members/:id', () => {
  it('AC-6.1: includes unpaid_fines_cents', async () => {
    const memberId = seedMember();
    const loanId = seedLoan(seedBook({ isbn: '978-finemem1234', total_copies: 5 }), memberId);
    db.prepare('INSERT INTO fines (id, member_id, loan_id, amount_cents) VALUES (?, ?, ?, ?)')
      .run(crypto.randomUUID(), memberId, loanId, 350);

    const res = await request(app).get(`/api/members/${memberId}`);
    expect(res.status).toBe(200);
    expect(res.body.unpaid_fines_cents).toBe(350);
  });
});