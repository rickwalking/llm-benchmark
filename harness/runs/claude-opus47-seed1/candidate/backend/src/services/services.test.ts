import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeBook, makeMember, makeStack, type TestStack } from '../test-utils/factory.js';

let stack: TestStack;

beforeEach(() => {
  stack = makeStack();
});

afterEach(() => {
  stack.close();
});

describe('books', () => {
  it('AC-1.1 lists books sorted by title (case-insensitive)', async () => {
    await makeBook(stack.agent, { title: 'banana', isbn: '9781111111111' });
    await makeBook(stack.agent, { title: 'Apple', isbn: '9782222222222' });
    await makeBook(stack.agent, { title: 'cherry', isbn: '9783333333333' });

    const res = await stack.agent.get('/api/books');
    expect(res.status).toBe(200);
    const titles = (res.body as Array<{ title: string }>).map((b) => b.title);
    expect(titles).toEqual(['Apple', 'banana', 'cherry']);
  });

  it('AC-1.2 includes reservation_queue_depth on detail', async () => {
    const book = await makeBook(stack.agent);
    const m1 = await makeMember(stack.agent);
    const m2 = await makeMember(stack.agent);
    const m3 = await makeMember(stack.agent);
    // m1 borrows then m2 + m3 reserve
    expect((await stack.agent.post('/api/loans').send({ book_id: book.id, member_id: m1.id })).status).toBe(201);
    expect(
      (await stack.agent.post('/api/reservations').send({ book_id: book.id, member_id: m2.id })).status,
    ).toBe(201);
    expect(
      (await stack.agent.post('/api/reservations').send({ book_id: book.id, member_id: m3.id })).status,
    ).toBe(201);

    const res = await stack.agent.get(`/api/books/${book.id}`);
    expect(res.status).toBe(200);
    expect(res.body.reservation_queue_depth).toBe(2);
  });

  it('AC-1.4 returns 404 for unknown book', async () => {
    const res = await stack.agent.get('/api/books/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Book not found' });
  });

  it('AC-2.1 creates a book and returns 201', async () => {
    const res = await stack.agent.post('/api/books').send({
      title: 'New',
      author: 'Author',
      isbn: '9780000000001',
      total_copies: 2,
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.available_copies).toBe(2);
  });

  it('AC-2.2 rejects duplicate ISBN with 409', async () => {
    await makeBook(stack.agent, { isbn: '9780000000111' });
    const res = await stack.agent.post('/api/books').send({
      title: 'Other',
      author: 'A',
      isbn: '9780000000111',
      total_copies: 1,
    });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'ISBN already exists' });
  });

  it('rejects invalid ISBN with 400', async () => {
    const res = await stack.agent.post('/api/books').send({
      title: 't',
      author: 'a',
      isbn: 'abcd',
      total_copies: 1,
    });
    expect(res.status).toBe(400);
  });

  it('rejects total_copies < 1 with 400', async () => {
    const res = await stack.agent.post('/api/books').send({
      title: 't',
      author: 'a',
      isbn: '9780000000222',
      total_copies: 0,
    });
    expect(res.status).toBe(400);
  });
});

describe('members', () => {
  it('AC-2.3 creates a member', async () => {
    const res = await stack.agent.post('/api/members').send({
      name: 'Pat',
      email: 'pat@example.org',
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('active');
  });

  it('AC-2.4 rejects duplicate email with 409', async () => {
    await stack.agent.post('/api/members').send({ name: 'A', email: 'shared@x.com' });
    const res = await stack.agent.post('/api/members').send({ name: 'B', email: 'shared@x.com' });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Email already exists' });
  });

  it('rejects invalid email with 400', async () => {
    const res = await stack.agent.post('/api/members').send({ name: 'A', email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('AC-6.1 includes unpaid_fines_cents on member detail', async () => {
    const member = await makeMember(stack.agent);
    const book = await makeBook(stack.agent);
    const loan = await stack.agent.post('/api/loans').send({ book_id: book.id, member_id: member.id });
    await stack.agent.post('/api/dev/backdate-loan').send({ loan_id: loan.body.id, days: 20 });
    await stack.agent.post(`/api/loans/${loan.body.id}/return`);

    const res = await stack.agent.get(`/api/members/${member.id}`);
    expect(res.status).toBe(200);
    expect(res.body.unpaid_fines_cents).toBeGreaterThan(0);
    expect(res.body.unpaid_fines.length).toBe(1);
  });
});

describe('loans', () => {
  it('AC-3.1 borrowing returns 201 and decreases available_copies', async () => {
    const book = await makeBook(stack.agent, { total_copies: 2 });
    const member = await makeMember(stack.agent);
    const res = await stack.agent.post('/api/loans').send({
      book_id: book.id,
      member_id: member.id,
    });
    expect(res.status).toBe(201);
    expect(res.body.due_at).toBeDefined();
    const detail = await stack.agent.get(`/api/books/${book.id}`);
    expect(detail.body.available_copies).toBe(1);
  });

  it('AC-3.2 rejects 6th simultaneous loan with 409', async () => {
    const member = await makeMember(stack.agent);
    for (let i = 0; i < 5; i += 1) {
      const b = await makeBook(stack.agent);
      const r = await stack.agent.post('/api/loans').send({ book_id: b.id, member_id: member.id });
      expect(r.status).toBe(201);
    }
    const sixth = await makeBook(stack.agent);
    const res = await stack.agent.post('/api/loans').send({
      book_id: sixth.id,
      member_id: member.id,
    });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Loan limit reached' });
  });

  it('AC-3.2 allows 5th loan and surfaces a warning', async () => {
    const member = await makeMember(stack.agent);
    for (let i = 0; i < 4; i += 1) {
      const b = await makeBook(stack.agent);
      await stack.agent.post('/api/loans').send({ book_id: b.id, member_id: member.id });
    }
    const fifth = await makeBook(stack.agent);
    const res = await stack.agent.post('/api/loans').send({
      book_id: fifth.id,
      member_id: member.id,
    });
    expect(res.status).toBe(201);
    expect(res.body.warnings.some((w: string) => w.includes('5th'))).toBe(true);
  });

  it('AC-3.3 rejects suspended members with 403', async () => {
    const member = await makeMember(stack.agent);
    stack.db.prepare("UPDATE members SET status = 'suspended' WHERE id = ?").run(member.id);
    const book = await makeBook(stack.agent);
    const res = await stack.agent.post('/api/loans').send({
      book_id: book.id,
      member_id: member.id,
    });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Member is suspended' });
  });

  it('AC-3.4 rejects when fines exceed $5.00 (boundary $5.01)', async () => {
    const member = await makeMember(stack.agent);
    const book1 = await makeBook(stack.agent);
    // create a loan to anchor a fine
    const loan = await stack.agent.post('/api/loans').send({
      book_id: book1.id,
      member_id: member.id,
    });
    stack.db
      .prepare(
        'INSERT INTO fines (id, member_id, loan_id, amount_cents) VALUES (lower(hex(randomblob(16))), ?, ?, ?)',
      )
      .run(member.id, loan.body.id, 501);

    const book2 = await makeBook(stack.agent);
    const res = await stack.agent.post('/api/loans').send({
      book_id: book2.id,
      member_id: member.id,
    });
    expect(res.status).toBe(402);
    expect(res.body).toEqual({ error: 'Outstanding fines exceed limit' });
  });

  it('AC-3.4 allows when fines equal exactly $5.00', async () => {
    const member = await makeMember(stack.agent);
    const book1 = await makeBook(stack.agent);
    const loan = await stack.agent.post('/api/loans').send({
      book_id: book1.id,
      member_id: member.id,
    });
    stack.db
      .prepare(
        'INSERT INTO fines (id, member_id, loan_id, amount_cents) VALUES (lower(hex(randomblob(16))), ?, ?, ?)',
      )
      .run(member.id, loan.body.id, 500);

    const book2 = await makeBook(stack.agent);
    const res = await stack.agent.post('/api/loans').send({
      book_id: book2.id,
      member_id: member.id,
    });
    expect(res.status).toBe(201);
  });

  it('AC-3.5 returns 409 with reservation message when no copies available', async () => {
    const book = await makeBook(stack.agent, { total_copies: 1 });
    const m1 = await makeMember(stack.agent);
    const m2 = await makeMember(stack.agent);
    await stack.agent.post('/api/loans').send({ book_id: book.id, member_id: m1.id });
    const res = await stack.agent.post('/api/loans').send({
      book_id: book.id,
      member_id: m2.id,
    });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'No copies available — reserve instead' });
  });

  it('AC-4.1 returning a loan increments available copies', async () => {
    const book = await makeBook(stack.agent, { total_copies: 1 });
    const member = await makeMember(stack.agent);
    const loan = await stack.agent.post('/api/loans').send({
      book_id: book.id,
      member_id: member.id,
    });
    const res = await stack.agent.post(`/api/loans/${loan.body.id}/return`);
    expect(res.status).toBe(200);
    expect(res.body.fine_cents).toBe(0);
    const detail = await stack.agent.get(`/api/books/${book.id}`);
    expect(detail.body.available_copies).toBe(1);
  });

  it('AC-4.2 creates a fine for late return', async () => {
    const book = await makeBook(stack.agent);
    const member = await makeMember(stack.agent);
    const loan = await stack.agent.post('/api/loans').send({
      book_id: book.id,
      member_id: member.id,
    });
    // 10 days late
    await stack.agent.post('/api/dev/backdate-loan').send({
      loan_id: loan.body.id,
      seconds: (10 + 14) * 86400 - 60,
    });
    const res = await stack.agent.post(`/api/loans/${loan.body.id}/return`);
    expect(res.status).toBe(200);
    expect(res.body.fine_cents).toBe(500); // 10 days × $0.50
  });

  it('AC-4.2 caps a 30-day-late fine at $10.00', async () => {
    const book = await makeBook(stack.agent);
    const member = await makeMember(stack.agent);
    const loan = await stack.agent.post('/api/loans').send({
      book_id: book.id,
      member_id: member.id,
    });
    await stack.agent.post('/api/dev/backdate-loan').send({
      loan_id: loan.body.id,
      seconds: (30 + 14) * 86400 - 60,
    });
    const res = await stack.agent.post(`/api/loans/${loan.body.id}/return`);
    expect(res.body.fine_cents).toBe(1000);
  });

  it('AC-4.3 rejects double-return with 409', async () => {
    const book = await makeBook(stack.agent);
    const member = await makeMember(stack.agent);
    const loan = await stack.agent.post('/api/loans').send({
      book_id: book.id,
      member_id: member.id,
    });
    await stack.agent.post(`/api/loans/${loan.body.id}/return`);
    const res = await stack.agent.post(`/api/loans/${loan.body.id}/return`);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Loan already returned' });
  });

  it('AC-4.4 returning notifies head of queue and keeps copy unavailable', async () => {
    const book = await makeBook(stack.agent, { total_copies: 1 });
    const m1 = await makeMember(stack.agent);
    const m2 = await makeMember(stack.agent);
    const loan = await stack.agent.post('/api/loans').send({
      book_id: book.id,
      member_id: m1.id,
    });
    await stack.agent.post('/api/reservations').send({
      book_id: book.id,
      member_id: m2.id,
    });
    const ret = await stack.agent.post(`/api/loans/${loan.body.id}/return`);
    expect(ret.status).toBe(200);
    expect(ret.body.notified_reservation_id).not.toBeNull();
    const detail = await stack.agent.get(`/api/books/${book.id}`);
    // Available stays 0 because notified hold reserves a copy
    expect(detail.body.available_copies).toBe(0);
  });
});

describe('reservations', () => {
  it('AC-5.1 creates a waiting reservation', async () => {
    const book = await makeBook(stack.agent);
    const m1 = await makeMember(stack.agent);
    const m2 = await makeMember(stack.agent);
    await stack.agent.post('/api/loans').send({ book_id: book.id, member_id: m1.id });
    const res = await stack.agent.post('/api/reservations').send({
      book_id: book.id,
      member_id: m2.id,
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('waiting');
  });

  it('AC-5.2 rejects when the member already has it on loan', async () => {
    const book = await makeBook(stack.agent);
    const member = await makeMember(stack.agent);
    await stack.agent.post('/api/loans').send({ book_id: book.id, member_id: member.id });
    const res = await stack.agent.post('/api/reservations').send({
      book_id: book.id,
      member_id: member.id,
    });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Member already has this book on loan' });
  });

  it('AC-5.3 rejects duplicate reservation', async () => {
    const book = await makeBook(stack.agent);
    const m1 = await makeMember(stack.agent);
    const m2 = await makeMember(stack.agent);
    await stack.agent.post('/api/loans').send({ book_id: book.id, member_id: m1.id });
    expect(
      (await stack.agent.post('/api/reservations').send({ book_id: book.id, member_id: m2.id })).status,
    ).toBe(201);
    const res = await stack.agent.post('/api/reservations').send({
      book_id: book.id,
      member_id: m2.id,
    });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Duplicate reservation' });
  });

  it('AC-5.4 notified member can borrow, fulfilling reservation', async () => {
    const book = await makeBook(stack.agent);
    const m1 = await makeMember(stack.agent);
    const m2 = await makeMember(stack.agent);
    const loan = await stack.agent.post('/api/loans').send({ book_id: book.id, member_id: m1.id });
    await stack.agent.post('/api/reservations').send({ book_id: book.id, member_id: m2.id });
    await stack.agent.post(`/api/loans/${loan.body.id}/return`);

    const borrow = await stack.agent.post('/api/loans').send({
      book_id: book.id,
      member_id: m2.id,
    });
    expect(borrow.status).toBe(201);

    const member = await stack.agent.get(`/api/members/${m2.id}`);
    // active loan present, no active reservations
    expect(member.body.active_loans.length).toBe(1);
    expect(member.body.reservations.length).toBe(0);
  });

  it('AC-5.4 rejects another member borrowing while reserved-for', async () => {
    const book = await makeBook(stack.agent);
    const m1 = await makeMember(stack.agent);
    const m2 = await makeMember(stack.agent);
    const m3 = await makeMember(stack.agent);
    const loan = await stack.agent.post('/api/loans').send({ book_id: book.id, member_id: m1.id });
    await stack.agent.post('/api/reservations').send({ book_id: book.id, member_id: m2.id });
    await stack.agent.post(`/api/loans/${loan.body.id}/return`);

    const res = await stack.agent.post('/api/loans').send({
      book_id: book.id,
      member_id: m3.id,
    });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Book is reserved for another member' });
  });

  it('AC-5.5 expires stale notified reservations and notifies next', async () => {
    const book = await makeBook(stack.agent);
    const m1 = await makeMember(stack.agent);
    const m2 = await makeMember(stack.agent);
    const m3 = await makeMember(stack.agent);
    const loan = await stack.agent.post('/api/loans').send({ book_id: book.id, member_id: m1.id });
    const r2 = await stack.agent.post('/api/reservations').send({ book_id: book.id, member_id: m2.id });
    const r3 = await stack.agent.post('/api/reservations').send({ book_id: book.id, member_id: m3.id });
    await stack.agent.post(`/api/loans/${loan.body.id}/return`);

    // Backdate m2's notification past expiry
    await stack.agent.post('/api/dev/backdate-reservation').send({
      reservation_id: r2.body.id,
      hours: 49,
    });
    const exp = await stack.agent.post('/api/reservations/expire');
    expect(exp.status).toBe(200);
    expect(exp.body.expired_count).toBe(1);

    const r2State = stack.db
      .prepare('SELECT status FROM reservations WHERE id = ?')
      .get(r2.body.id) as { status: string };
    const r3State = stack.db
      .prepare('SELECT status FROM reservations WHERE id = ?')
      .get(r3.body.id) as { status: string };
    expect(r2State.status).toBe('expired');
    expect(r3State.status).toBe('notified');
  });

  it('cancelling a notified reservation promotes the next one', async () => {
    const book = await makeBook(stack.agent);
    const m1 = await makeMember(stack.agent);
    const m2 = await makeMember(stack.agent);
    const m3 = await makeMember(stack.agent);
    const loan = await stack.agent.post('/api/loans').send({ book_id: book.id, member_id: m1.id });
    const r2 = await stack.agent.post('/api/reservations').send({ book_id: book.id, member_id: m2.id });
    const r3 = await stack.agent.post('/api/reservations').send({ book_id: book.id, member_id: m3.id });
    await stack.agent.post(`/api/loans/${loan.body.id}/return`);

    const cancel = await stack.agent.delete(`/api/reservations/${r2.body.id}`);
    expect(cancel.status).toBe(200);

    const r3State = stack.db
      .prepare('SELECT status FROM reservations WHERE id = ?')
      .get(r3.body.id) as { status: string };
    expect(r3State.status).toBe('notified');
  });
});

describe('fines', () => {
  it('AC-6.2 marks a fine paid', async () => {
    const member = await makeMember(stack.agent);
    const book = await makeBook(stack.agent);
    const loan = await stack.agent.post('/api/loans').send({ book_id: book.id, member_id: member.id });
    await stack.agent.post('/api/dev/backdate-loan').send({ loan_id: loan.body.id, days: 20 });
    const ret = await stack.agent.post(`/api/loans/${loan.body.id}/return`);
    const fineId = ret.body.fine_id;

    const pay = await stack.agent.post(`/api/fines/${fineId}/pay`);
    expect(pay.status).toBe(200);
    expect(pay.body.paid_at).not.toBeNull();
  });

  it('AC-6.3 rejects paying an already-paid fine with 409', async () => {
    const member = await makeMember(stack.agent);
    const book = await makeBook(stack.agent);
    const loan = await stack.agent.post('/api/loans').send({ book_id: book.id, member_id: member.id });
    await stack.agent.post('/api/dev/backdate-loan').send({ loan_id: loan.body.id, days: 20 });
    const ret = await stack.agent.post(`/api/loans/${loan.body.id}/return`);
    const fineId = ret.body.fine_id;
    await stack.agent.post(`/api/fines/${fineId}/pay`);

    const second = await stack.agent.post(`/api/fines/${fineId}/pay`);
    expect(second.status).toBe(409);
    expect(second.body).toEqual({ error: 'Fine already paid' });
  });

  it('returns 404 paying an unknown fine', async () => {
    const res = await stack.agent.post('/api/fines/00000000-0000-0000-0000-000000000000/pay');
    expect(res.status).toBe(404);
  });
});
