import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type DB } from '../db/index.js';
import {
  createBook,
  getBook,
  listBooks,
} from './bookService.js';
import {
  activeLoanCountFor,
  createMember,
  getMemberDetail,
  getMemberRow,
  listMembers,
  unpaidFinesCentsFor,
} from './memberService.js';
import {
  cancelReservation,
  createReservation,
  expireStaleReservations,
  promoteNextWaiting,
} from './reservationService.js';
import { borrow, listActiveLoans, returnLoan } from './loanService.js';
import { listFines, payFine } from './fineService.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  PaymentRequiredError,
} from '../errors.js';

let db: DB;

beforeEach(() => {
  db = openDatabase({ filename: ':memory:', seed: false });
});

afterEach(() => {
  db.close();
});

let bookCounter = 0;
function freshBook(overrides: Partial<Parameters<typeof createBook>[1]> = {}) {
  bookCounter += 1;
  return createBook(db, {
    title: `Book ${bookCounter}`,
    author: 'Author',
    isbn: `978${String(bookCounter).padStart(10, '0')}`,
    total_copies: 1,
    ...overrides,
  });
}

let memberCounter = 0;
function freshMember(overrides: Partial<{ name: string; email: string }> = {}) {
  memberCounter += 1;
  return createMember(db, {
    name: `Person ${memberCounter}`,
    email: `person${memberCounter}@example.com`,
    ...overrides,
  });
}

describe('bookService unit', () => {
  it('createBook trims title, author, and isbn', () => {
    const book = createBook(db, {
      title: '  Spaces  ',
      author: '  Auth  ',
      isbn: ' 9781111111111 ',
      total_copies: 2,
    });
    expect(book.title).toBe('Spaces');
    expect(book.author).toBe('Auth');
    expect(book.isbn).toBe('9781111111111');
    expect(book.available_copies).toBe(2);
  });

  it('createBook throws ConflictError on duplicate ISBN (specific message)', () => {
    freshBook({ isbn: '9789999999999' });
    expect(() =>
      createBook(db, {
        title: 'Other',
        author: 'A',
        isbn: '9789999999999',
        total_copies: 1,
      }),
    ).toThrowError(/^ISBN already exists$/);
    expect(() =>
      createBook(db, {
        title: 'Other',
        author: 'A',
        isbn: '9789999999999',
        total_copies: 1,
      }),
    ).toThrow(ConflictError);
  });

  it('listBooks sorts case-insensitively by title', () => {
    createBook(db, { title: 'banana', author: 'a', isbn: '9781000000001', total_copies: 1 });
    createBook(db, { title: 'Apple', author: 'a', isbn: '9781000000002', total_copies: 1 });
    createBook(db, { title: 'cherry', author: 'a', isbn: '9781000000003', total_copies: 1 });
    const titles = listBooks(db).map((b) => b.title);
    expect(titles).toEqual(['Apple', 'banana', 'cherry']);
  });

  it('listBooks computes available_copies as total minus active loans minus notified holds', () => {
    const book = freshBook({ total_copies: 3 });
    const m1 = freshMember();
    const m2 = freshMember();
    const m3 = freshMember();
    borrow(db, { member_id: m1.id, book_id: book.id });
    borrow(db, { member_id: m2.id, book_id: book.id });
    let row = listBooks(db).find((b) => b.id === book.id)!;
    expect(row.available_copies).toBe(1);
    // Reserve and trigger a notification by returning one
    createReservation(db, { member_id: m3.id, book_id: book.id });
    const loan = listActiveLoans(db).find((l) => l.member_id === m1.id)!;
    returnLoan(db, { loan_id: loan.id });
    row = listBooks(db).find((b) => b.id === book.id)!;
    expect(row.available_copies).toBe(1); // 3 total - 1 active loan - 1 notified hold
  });

  it('getBook returns notFound message exactly "Book not found"', () => {
    expect(() => getBook(db, '00000000-0000-0000-0000-000000000000')).toThrow(NotFoundError);
    try {
      getBook(db, '00000000-0000-0000-0000-000000000000');
    } catch (err) {
      expect((err as Error).message).toBe('Book not found');
    }
  });

  it('getBook reports queue depth and active loans', () => {
    const book = freshBook();
    const m1 = freshMember();
    const m2 = freshMember();
    const m3 = freshMember();
    borrow(db, { member_id: m1.id, book_id: book.id });
    createReservation(db, { member_id: m2.id, book_id: book.id });
    createReservation(db, { member_id: m3.id, book_id: book.id });
    const detail = getBook(db, book.id);
    expect(detail.active_loans).toBe(1);
    expect(detail.reservation_queue_depth).toBe(2);
    expect(detail.available_copies).toBe(0);
  });
});

describe('memberService unit', () => {
  it('createMember lowercases and trims the email', () => {
    const m = createMember(db, { name: ' Pat ', email: '  PaT@Example.COM  ' });
    expect(m.name).toBe('Pat');
    expect(m.email).toBe('pat@example.com');
    expect(m.status).toBe('active');
  });

  it('createMember rejects duplicate email with the exact message', () => {
    createMember(db, { name: 'A', email: 'dup@x.com' });
    try {
      createMember(db, { name: 'B', email: 'DUP@x.com' });
      expect.fail('expected ConflictError');
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictError);
      expect((err as Error).message).toBe('Email already exists');
    }
  });

  it('listMembers sorts by name', () => {
    createMember(db, { name: 'Charlie', email: 'c@x.com' });
    createMember(db, { name: 'alice', email: 'a@x.com' });
    createMember(db, { name: 'Bob', email: 'b@x.com' });
    const names = listMembers(db).map((m) => m.name);
    expect(names).toEqual(['alice', 'Bob', 'Charlie']);
  });

  it('getMemberRow throws "Member not found" for unknown id', () => {
    try {
      getMemberRow(db, '00000000-0000-0000-0000-000000000000');
      expect.fail('expected NotFoundError');
    } catch (err) {
      expect(err).toBeInstanceOf(NotFoundError);
      expect((err as Error).message).toBe('Member not found');
    }
  });

  it('unpaidFinesCentsFor returns 0 when there are no fines', () => {
    const m = freshMember();
    expect(unpaidFinesCentsFor(db, m.id)).toBe(0);
  });

  it('activeLoanCountFor returns 0 when there are no loans', () => {
    const m = freshMember();
    expect(activeLoanCountFor(db, m.id)).toBe(0);
  });

  it('getMemberDetail aggregates loans, reservations, fines, and unpaid totals', () => {
    const m = freshMember();
    const other = freshMember();
    const lent = freshBook();
    const reserved = freshBook();
    borrow(db, { member_id: m.id, book_id: lent.id });
    borrow(db, { member_id: other.id, book_id: reserved.id });
    createReservation(db, { member_id: m.id, book_id: reserved.id });

    const detail = getMemberDetail(db, m.id);
    expect(detail.active_loans.length).toBe(1);
    expect(detail.reservations.length).toBe(1);
    expect(detail.reservations[0].position).toBe(1);
    expect(detail.unpaid_fines_cents).toBe(0);
    expect(detail.active_loans[0].book_title).toBe(lent.title);
  });
});

describe('loanService unit', () => {
  it('borrow throws NotFoundError for unknown book', () => {
    const m = freshMember();
    expect(() => borrow(db, { member_id: m.id, book_id: '00000000-0000-0000-0000-000000000000' }))
      .toThrow(NotFoundError);
  });

  it('borrow throws NotFoundError for unknown member', () => {
    const b = freshBook();
    expect(() => borrow(db, { member_id: '00000000-0000-0000-0000-000000000000', book_id: b.id }))
      .toThrow(NotFoundError);
  });

  it('borrow returns no warning at 4 active loans', () => {
    const m = freshMember();
    for (let i = 0; i < 3; i += 1) borrow(db, { member_id: m.id, book_id: freshBook().id });
    const result = borrow(db, { member_id: m.id, book_id: freshBook().id });
    expect(result.warnings).toEqual([]);
  });

  it('borrow returns the 5th-loan warning at exactly 5 active loans', () => {
    const m = freshMember();
    for (let i = 0; i < 4; i += 1) borrow(db, { member_id: m.id, book_id: freshBook().id });
    const result = borrow(db, { member_id: m.id, book_id: freshBook().id });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/5th/);
  });

  it('borrow throws ConflictError "Loan limit reached" at the 6th loan', () => {
    const m = freshMember();
    for (let i = 0; i < 5; i += 1) borrow(db, { member_id: m.id, book_id: freshBook().id });
    try {
      borrow(db, { member_id: m.id, book_id: freshBook().id });
      expect.fail('expected ConflictError');
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictError);
      expect((err as Error).message).toBe('Loan limit reached');
    }
  });

  it('borrow throws ForbiddenError "Member is suspended" for suspended members', () => {
    const m = freshMember();
    db.prepare("UPDATE members SET status = 'suspended' WHERE id = ?").run(m.id);
    try {
      borrow(db, { member_id: m.id, book_id: freshBook().id });
      expect.fail('expected ForbiddenError');
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenError);
      expect((err as Error).message).toBe('Member is suspended');
    }
  });

  it('borrow throws PaymentRequiredError "Outstanding fines exceed limit" when fines > $5.00', () => {
    const m = freshMember();
    const b = freshBook();
    const loan = borrow(db, { member_id: m.id, book_id: b.id });
    db.prepare(
      'INSERT INTO fines (id, member_id, loan_id, amount_cents) VALUES (lower(hex(randomblob(16))), ?, ?, ?)',
    ).run(m.id, loan.loan.id, 501);
    try {
      borrow(db, { member_id: m.id, book_id: freshBook().id });
      expect.fail('expected PaymentRequiredError');
    } catch (err) {
      expect(err).toBeInstanceOf(PaymentRequiredError);
      expect((err as Error).message).toBe('Outstanding fines exceed limit');
    }
  });

  it('borrow throws ConflictError "No copies available — reserve instead" when no copies', () => {
    const m1 = freshMember();
    const m2 = freshMember();
    const b = freshBook({ total_copies: 1 });
    borrow(db, { member_id: m1.id, book_id: b.id });
    try {
      borrow(db, { member_id: m2.id, book_id: b.id });
      expect.fail('expected ConflictError');
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictError);
      expect((err as Error).message).toBe('No copies available — reserve instead');
    }
  });

  it('borrow throws "Book is reserved for another member" when notified hold belongs to someone else', () => {
    const m1 = freshMember();
    const m2 = freshMember();
    const m3 = freshMember();
    const b = freshBook({ total_copies: 1 });
    const loan = borrow(db, { member_id: m1.id, book_id: b.id });
    createReservation(db, { member_id: m2.id, book_id: b.id });
    returnLoan(db, { loan_id: loan.loan.id });
    try {
      borrow(db, { member_id: m3.id, book_id: b.id });
      expect.fail('expected ConflictError');
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictError);
      expect((err as Error).message).toBe('Book is reserved for another member');
    }
  });

  it('borrow fulfils the notified reservation and marks status fulfilled', () => {
    const m1 = freshMember();
    const m2 = freshMember();
    const b = freshBook({ total_copies: 1 });
    const loan = borrow(db, { member_id: m1.id, book_id: b.id });
    const reservation = createReservation(db, { member_id: m2.id, book_id: b.id });
    returnLoan(db, { loan_id: loan.loan.id });
    borrow(db, { member_id: m2.id, book_id: b.id });
    const status = db
      .prepare('SELECT status FROM reservations WHERE id = ?')
      .get(reservation.id) as { status: string };
    expect(status.status).toBe('fulfilled');
  });

  it('returnLoan throws "Loan not found" for unknown loan id', () => {
    try {
      returnLoan(db, { loan_id: '00000000-0000-0000-0000-000000000000' });
      expect.fail('expected NotFoundError');
    } catch (err) {
      expect(err).toBeInstanceOf(NotFoundError);
      expect((err as Error).message).toBe('Loan not found');
    }
  });

  it('returnLoan throws "Loan already returned" on second attempt', () => {
    const m = freshMember();
    const b = freshBook();
    const loan = borrow(db, { member_id: m.id, book_id: b.id });
    returnLoan(db, { loan_id: loan.loan.id });
    try {
      returnLoan(db, { loan_id: loan.loan.id });
      expect.fail('expected ConflictError');
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictError);
      expect((err as Error).message).toBe('Loan already returned');
    }
  });

  it('returnLoan creates no fine when on time and no fine row exists', () => {
    const m = freshMember();
    const b = freshBook();
    const loan = borrow(db, { member_id: m.id, book_id: b.id });
    const result = returnLoan(db, { loan_id: loan.loan.id });
    expect(result.fine_cents).toBe(0);
    expect(result.fine_id).toBeNull();
    const fines = listFines(db, m.id);
    expect(fines).toEqual([]);
  });

  it('returnLoan creates a fine row for late returns', () => {
    const m = freshMember();
    const b = freshBook();
    const loan = borrow(db, { member_id: m.id, book_id: b.id });
    // Manually backdate so it's 5 days late.
    const newBorrowed = new Date(Date.now() - (5 + 14) * 86400_000 + 60_000).toISOString();
    const newDue = new Date(Date.now() - 5 * 86400_000 + 60_000).toISOString();
    db.prepare('UPDATE loans SET borrowed_at = ?, due_at = ? WHERE id = ?').run(
      newBorrowed,
      newDue,
      loan.loan.id,
    );
    const result = returnLoan(db, { loan_id: loan.loan.id });
    expect(result.fine_cents).toBe(250);
    expect(result.fine_id).not.toBeNull();
    const fines = listFines(db, m.id);
    expect(fines).toHaveLength(1);
    expect(fines[0].amount_cents).toBe(250);
  });

  it('returnLoan promotes the next waiting reservation when no notified hold exists', () => {
    const m1 = freshMember();
    const m2 = freshMember();
    const b = freshBook();
    const loan = borrow(db, { member_id: m1.id, book_id: b.id });
    const r = createReservation(db, { member_id: m2.id, book_id: b.id });
    const result = returnLoan(db, { loan_id: loan.loan.id });
    expect(result.notified_reservation_id).toBe(r.id);
    const status = db
      .prepare('SELECT status FROM reservations WHERE id = ?')
      .get(r.id) as { status: string };
    expect(status.status).toBe('notified');
  });

  it('returnLoan does not promote a waiting reservation when a notified hold already exists', () => {
    const m1 = freshMember();
    const m2 = freshMember();
    const m3 = freshMember();
    const b = freshBook({ total_copies: 2 });
    const loanA = borrow(db, { member_id: m1.id, book_id: b.id });
    const loanB = borrow(db, { member_id: m2.id, book_id: b.id });
    const r3 = createReservation(db, { member_id: m3.id, book_id: b.id });
    // First return promotes m3
    const r1 = returnLoan(db, { loan_id: loanA.loan.id });
    expect(r1.notified_reservation_id).toBe(r3.id);
    // Second return: no other waiting reservations, so no further promotion
    const r2 = returnLoan(db, { loan_id: loanB.loan.id });
    expect(r2.notified_reservation_id).toBeNull();
  });

  it('listActiveLoans returns only loans without returned_at, sorted by due_at', () => {
    const m = freshMember();
    const a = borrow(db, { member_id: m.id, book_id: freshBook().id });
    borrow(db, { member_id: m.id, book_id: freshBook().id });
    returnLoan(db, { loan_id: a.loan.id });
    const active = listActiveLoans(db);
    expect(active.length).toBe(1);
  });
});

describe('reservationService unit', () => {
  it('createReservation rejects unknown book with NotFoundError "Book not found"', () => {
    const m = freshMember();
    try {
      createReservation(db, { member_id: m.id, book_id: '00000000-0000-0000-0000-000000000000' });
      expect.fail();
    } catch (err) {
      expect(err).toBeInstanceOf(NotFoundError);
      expect((err as Error).message).toBe('Book not found');
    }
  });

  it('createReservation rejects unknown member with NotFoundError "Member not found"', () => {
    const b = freshBook();
    try {
      createReservation(db, { member_id: '00000000-0000-0000-0000-000000000000', book_id: b.id });
      expect.fail();
    } catch (err) {
      expect(err).toBeInstanceOf(NotFoundError);
      expect((err as Error).message).toBe('Member not found');
    }
  });

  it('createReservation rejects when member already has the book on loan', () => {
    const m = freshMember();
    const b = freshBook();
    borrow(db, { member_id: m.id, book_id: b.id });
    try {
      createReservation(db, { member_id: m.id, book_id: b.id });
      expect.fail();
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictError);
      expect((err as Error).message).toBe('Member already has this book on loan');
    }
  });

  it('createReservation rejects a duplicate active reservation', () => {
    const m = freshMember();
    const owner = freshMember();
    const b = freshBook();
    borrow(db, { member_id: owner.id, book_id: b.id });
    createReservation(db, { member_id: m.id, book_id: b.id });
    try {
      createReservation(db, { member_id: m.id, book_id: b.id });
      expect.fail();
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictError);
      expect((err as Error).message).toBe('Duplicate reservation');
    }
  });

  it('cancelReservation throws NotFoundError "Reservation not found" for unknown id', () => {
    try {
      cancelReservation(db, '00000000-0000-0000-0000-000000000000');
      expect.fail();
    } catch (err) {
      expect(err).toBeInstanceOf(NotFoundError);
      expect((err as Error).message).toBe('Reservation not found');
    }
  });

  it('cancelReservation throws ConflictError when reservation is not active', () => {
    const m = freshMember();
    const owner = freshMember();
    const b = freshBook();
    borrow(db, { member_id: owner.id, book_id: b.id });
    const r = createReservation(db, { member_id: m.id, book_id: b.id });
    cancelReservation(db, r.id);
    try {
      cancelReservation(db, r.id);
      expect.fail();
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictError);
      expect((err as Error).message).toBe('Reservation is not active');
    }
  });

  it('cancelling a notified reservation promotes the next waiter', () => {
    const owner = freshMember();
    const m1 = freshMember();
    const m2 = freshMember();
    const b = freshBook();
    const loan = borrow(db, { member_id: owner.id, book_id: b.id });
    const r1 = createReservation(db, { member_id: m1.id, book_id: b.id });
    const r2 = createReservation(db, { member_id: m2.id, book_id: b.id });
    returnLoan(db, { loan_id: loan.loan.id });
    cancelReservation(db, r1.id);
    const next = db
      .prepare('SELECT status FROM reservations WHERE id = ?')
      .get(r2.id) as { status: string };
    expect(next.status).toBe('notified');
  });

  it('expireStaleReservations is a no-op when nothing has expired', () => {
    expect(expireStaleReservations(db)).toBe(0);
  });

  it('expireStaleReservations expires notified holds past their expires_at and notifies the next', () => {
    const owner = freshMember();
    const m1 = freshMember();
    const m2 = freshMember();
    const b = freshBook();
    const loan = borrow(db, { member_id: owner.id, book_id: b.id });
    const r1 = createReservation(db, { member_id: m1.id, book_id: b.id });
    const r2 = createReservation(db, { member_id: m2.id, book_id: b.id });
    returnLoan(db, { loan_id: loan.loan.id });
    db.prepare(
      "UPDATE reservations SET expires_at = datetime('now', '-1 hour') WHERE id = ?",
    ).run(r1.id);

    const expired = expireStaleReservations(db);
    expect(expired).toBe(1);
    const status1 = db.prepare('SELECT status FROM reservations WHERE id = ?').get(r1.id) as {
      status: string;
    };
    const status2 = db.prepare('SELECT status FROM reservations WHERE id = ?').get(r2.id) as {
      status: string;
    };
    expect(status1.status).toBe('expired');
    expect(status2.status).toBe('notified');
  });

  it('promoteNextWaiting is a no-op when no waiting reservations exist', () => {
    const b = freshBook();
    expect(() => promoteNextWaiting(db, b.id)).not.toThrow();
  });
});

describe('fineService unit', () => {
  it('payFine throws "Fine not found" for unknown id', () => {
    try {
      payFine(db, '00000000-0000-0000-0000-000000000000');
      expect.fail();
    } catch (err) {
      expect(err).toBeInstanceOf(NotFoundError);
      expect((err as Error).message).toBe('Fine not found');
    }
  });

  it('payFine sets paid_at to a non-null value and returns it', () => {
    const m = freshMember();
    const b = freshBook();
    const loan = borrow(db, { member_id: m.id, book_id: b.id });
    db.prepare(
      'INSERT INTO fines (id, member_id, loan_id, amount_cents) VALUES (?, ?, ?, ?)',
    ).run('fixed-fine-id', m.id, loan.loan.id, 100);
    const result = payFine(db, 'fixed-fine-id');
    expect(result.paid_at).not.toBeNull();
    expect(result.amount_cents).toBe(100);
    expect(result.id).toBe('fixed-fine-id');
  });

  it('payFine throws ConflictError "Fine already paid" the second time', () => {
    const m = freshMember();
    const b = freshBook();
    const loan = borrow(db, { member_id: m.id, book_id: b.id });
    db.prepare(
      'INSERT INTO fines (id, member_id, loan_id, amount_cents) VALUES (?, ?, ?, ?)',
    ).run('paid-fine', m.id, loan.loan.id, 50);
    payFine(db, 'paid-fine');
    try {
      payFine(db, 'paid-fine');
      expect.fail();
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictError);
      expect((err as Error).message).toBe('Fine already paid');
    }
  });

  it('listFines returns only fines for the given member when filtered', () => {
    const m1 = freshMember();
    const m2 = freshMember();
    const b = freshBook();
    const loan1 = borrow(db, { member_id: m1.id, book_id: b.id });
    const b2 = freshBook();
    const loan2 = borrow(db, { member_id: m2.id, book_id: b2.id });
    db.prepare(
      'INSERT INTO fines (id, member_id, loan_id, amount_cents) VALUES (?, ?, ?, ?)',
    ).run('a', m1.id, loan1.loan.id, 100);
    db.prepare(
      'INSERT INTO fines (id, member_id, loan_id, amount_cents) VALUES (?, ?, ?, ?)',
    ).run('b', m2.id, loan2.loan.id, 200);
    expect(listFines(db, m1.id)).toHaveLength(1);
    expect(listFines(db).length).toBe(2);
  });
});
