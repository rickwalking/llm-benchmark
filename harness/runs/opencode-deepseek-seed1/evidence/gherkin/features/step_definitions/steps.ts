import { Given, When, Then } from '@cucumber/cucumber';
import { v4 as uuid } from 'uuid';
import assert from 'node:assert';

interface BookBody {
  id: string;
  title: string;
  author: string;
  isbn: string;
  total_copies: number;
  available_copies: number;
}

interface MemberBody {
  id: string;
  name: string;
  email: string;
  member_since: string;
  status: string;
}

interface LoanBody {
  id: string;
  book_id: string;
  member_id: string;
  borrowed_at: string;
  due_at: string;
  returned_at: string | null;
}

interface ReturnResBody {
  loan: LoanBody;
  fineCreated: boolean;
}

interface FineRow {
  id: string;
  member_id: string;
  loan_id: string;
  amount_cents: number;
  paid_at: string | null;
}

interface ReservationRow {
  id: string;
  book_id: string;
  member_id: string;
  queued_at: string;
  status: string;
  notified_at: string | null;
  expires_at: string | null;
}

function asBooks(body: unknown): BookBody[] {
  return body as BookBody[];
}

function asBook(body: unknown): BookBody {
  return body as BookBody;
}

function asMember(body: unknown): MemberBody {
  return body as MemberBody;
}

function asMembers(body: unknown): MemberBody[] {
  return body as MemberBody[];
}

function asLoan(body: unknown): LoanBody {
  return body as LoanBody;
}

function asReturnRes(body: unknown): ReturnResBody {
  return body as ReturnResBody;
}

async function httpRequest(
  baseUrl: string,
  path: string,
  method: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const resBody = await res.json().catch(() => null);
  return { status: res.status, body: resBody as Record<string, unknown> };
}

// --- Given steps ---

Given('the following books exist:', async function (dataTable: { raw: () => string[][] }) {
  const rows = dataTable.raw().slice(1);
  for (const [title, author, isbn, copies] of rows) {
    await httpRequest(this.baseUrl, '/api/books', 'POST', {
      title, author, isbn, total_copies: Number(copies),
    });
    this.context[`book_${title}`] = asBooks((await httpRequest(this.baseUrl, '/api/books', 'GET')).body)
      .find((b) => b.title === title)?.id ?? uuid();
  }
});

Given('the following members exist:', async function (dataTable: { raw: () => string[][] }) {
  const rows = dataTable.raw().slice(1);
  for (const [name, email] of rows) {
    await httpRequest(this.baseUrl, '/api/members', 'POST', { name, email });
    this.context[`member_${name}`] = asMembers((await httpRequest(this.baseUrl, '/api/members', 'GET')).body)
      .find((m) => m.name === name)?.id ?? uuid();
  }
});

Given(/^(.+) has borrowed "(.+)"$/, async function (memberName: string, bookTitle: string) {
  const memberId = this.context[`member_${memberName}`];
  const bookId = this.context[`book_${bookTitle}`];
  await httpRequest(this.baseUrl, '/api/loans', 'POST', { member_id: memberId, book_id: bookId });
});

Given(/^(.+) has (\d+) active loans$/, async function (memberName: string, count: string) {
  const memberId = this.context[`member_${memberName}`];
  for (let i = 0; i < Number(count); i++) {
    const res = await httpRequest(this.baseUrl, '/api/books', 'POST', {
      title: `Extra ${Date.now()}-${i}`,
      author: 'A',
      isbn: `978-${Date.now()}${i}`.slice(0, 17).replace(/[^0-9-]/g, '0'),
      total_copies: 3,
    });
    await httpRequest(this.baseUrl, '/api/loans', 'POST', { member_id: memberId, book_id: asBook(res.body).id });
  }
});

Given(/^a member "(.+)" with status "(.+)"$/, async function (name: string, status: string) {
  const res = await httpRequest(this.baseUrl, '/api/members', 'POST', {
    name, email: `${name.toLowerCase()}-${Date.now()}@test.com`,
  });
  this.context[`member_${name}`] = asMember(res.body).id;
  this.db.prepare('UPDATE members SET status = ? WHERE id = ?').run(status, asMember(res.body).id);
});

Given(/^(.+) has unpaid fines of \$(\d+\.\d+)$/, async function (memberName: string, amount: string) {
  const memberId = this.context[`member_${memberName}`];
  const res = await httpRequest(this.baseUrl, '/api/books', 'POST', {
    title: `FineBook-${Date.now()}`,
    author: 'A',
    isbn: `978-${Date.now()}`.slice(0, 17).replace(/[^0-9-]/g, '0'),
    total_copies: 3,
  });
  const loanRes = await httpRequest(this.baseUrl, '/api/loans', 'POST', { member_id: memberId, book_id: asBook(res.body).id });
  const fineId = uuid();
  this.db.prepare('INSERT INTO fines (id, member_id, loan_id, amount_cents) VALUES (?, ?, ?, ?)')
    .run(fineId, memberId, asLoan(loanRes.body).id, Math.round(Number(amount) * 100));
});

Given('a book with ISBN {string} already exists', async function (isbn: string) {
  await httpRequest(this.baseUrl, '/api/books', 'POST', {
    title: 'Existing', author: 'A', isbn, total_copies: 1,
  });
});

Given('a member with email {string} already exists', async function (email: string) {
  await httpRequest(this.baseUrl, '/api/members', 'POST', { name: 'Existing', email });
});

Given(/^(.+) has reserved "(.+)"$/, async function (memberName: string, bookTitle: string) {
  const key = memberName.replace(/ \(a third member\)$/, '');
  let memberId = this.context[`member_${key}`];
  if (!memberId) {
    const carolRes = await httpRequest(this.baseUrl, '/api/members', 'POST', {
      name: key, email: `${key.toLowerCase().replace(/\s+/g, '')}-${Date.now()}@test.com`,
    });
    memberId = asMember(carolRes.body).id;
    this.context[`member_${key}`] = memberId;
  }
  const bookId = this.context[`book_${bookTitle}`];
  await httpRequest(this.baseUrl, '/api/reservations', 'POST', { member_id: memberId, book_id: bookId });
});

Given(/^(.+) has already returned the loan$/, async function (memberName: string) {
  const memberId = this.context[`member_${memberName}`];
  const loan = this.db.prepare(
    'SELECT id FROM loans WHERE member_id = ? AND returned_at IS NULL ORDER BY borrowed_at ASC LIMIT 1'
  ).get(memberId) as { id: string } | undefined;
  if (loan) {
    this.context[`loanId_${memberName}`] = loan.id;
    await httpRequest(this.baseUrl, `/api/loans/${loan.id}/return`, 'POST');
  }
});

Given(/^the loan is (\d+) days overdue$/, async function (days: string) {
  const memberId = this.context['member_Alice Johnson'];
  const loan = this.db.prepare(
    'SELECT id FROM loans WHERE member_id = ? AND returned_at IS NULL ORDER BY borrowed_at ASC LIMIT 1'
  ).get(memberId) as { id: string } | undefined;
  if (loan) {
    const pastDue = new Date(Date.now() - (Number(days) - 0.5) * 24 * 60 * 60 * 1000).toISOString();
    this.db.prepare('UPDATE loans SET due_at = ? WHERE id = ?').run(pastDue, loan.id);
    this.context[`loanId_Alice Johnson`] = loan.id;
  }
});

Given(/^(.+) has an unpaid fine of \$(\d+\.\d+)$/, async function (memberName: string, amount: string) {
  const memberId = this.context[`member_${memberName}`];
  const res = await httpRequest(this.baseUrl, '/api/books', 'POST', {
    title: `UF-${Date.now()}`, author: 'A',
    isbn: `${Date.now()}`.slice(0, 13).padEnd(13, '0'),
    total_copies: 3,
  });
  const loanRes = await httpRequest(this.baseUrl, '/api/loans', 'POST', { member_id: memberId, book_id: asBook(res.body).id });
  const fineId = uuid();
  this.db.prepare('INSERT INTO fines (id, member_id, loan_id, amount_cents) VALUES (?, ?, ?, ?)')
    .run(fineId, memberId, asLoan(loanRes.body).id, Math.round(Number(amount) * 100));
  this.context[`fine_${memberName}`] = fineId;
});

Given(/^(.+) has a fine that is already paid$/, async function (memberName: string) {
  const memberId = this.context[`member_${memberName}`];
  const res = await httpRequest(this.baseUrl, '/api/books', 'POST', {
    title: `PF-${Date.now()}`, author: 'A',
    isbn: `${Date.now() + 1}`.slice(0, 13).padEnd(13, '0'),
    total_copies: 3,
  });
  const loanRes = await httpRequest(this.baseUrl, '/api/loans', 'POST', { member_id: memberId, book_id: asBook(res.body).id });
  const fineId = uuid();
  this.db.prepare('INSERT INTO fines (id, member_id, loan_id, amount_cents, paid_at) VALUES (?, ?, ?, ?, ?)')
    .run(fineId, memberId, asLoan(loanRes.body).id, 500, new Date().toISOString());
  this.context[`fine_${memberName}`] = fineId;
});

Given(/^(.+)'s notification expires$/, async function (memberName: string) {
  const memberId = this.context[`member_${memberName}`];
  this.db.prepare(`UPDATE reservations SET expires_at = ? WHERE member_id = ?`)
    .run(new Date(Date.now() - 1000).toISOString(), memberId);
});

// --- When steps ---

When('the librarian requests the book catalog', async function () {
  this.lastResponse = await httpRequest(this.baseUrl, '/api/books', 'GET');
});

When(/^the librarian requests the book "(.+)"$/, async function (title: string) {
  const bookId = this.context[`book_${title}`];
  this.lastResponse = await httpRequest(this.baseUrl, `/api/books/${bookId}`, 'GET');
});

When('the librarian requests the book with id {string}', async function (id: string) {
  this.lastResponse = await httpRequest(this.baseUrl, `/api/books/${id}`, 'GET');
});

When('the librarian creates a book with title {string}, author {string}, ISBN {string}, and {int} copies',
  async function (title: string, author: string, isbn: string, copies: number) {
    this.lastResponse = await httpRequest(this.baseUrl, '/api/books', 'POST', {
      title, author, isbn, total_copies: copies,
    });
  });

When('the librarian creates a book with ISBN {string}', async function (isbn: string) {
  this.lastResponse = await httpRequest(this.baseUrl, '/api/books', 'POST', {
    title: 'Test', author: 'T', isbn, total_copies: 1,
  });
});

When('the librarian creates a member with name {string} and email {string}', async function (name: string, email: string) {
  this.lastResponse = await httpRequest(this.baseUrl, '/api/members', 'POST', { name, email });
});

When(/^(.+) borrows "(.+)"$/, async function (memberName: string, bookTitle: string) {
  const memberId = this.context[`member_${memberName}`];
  const bookId = this.context[`book_${bookTitle}`];
  this.lastResponse = await httpRequest(this.baseUrl, '/api/loans', 'POST', {
    member_id: memberId, book_id: bookId,
  });
  if (this.lastResponse.status === 201) {
    this.context[`loan_${memberName}_${bookTitle}`] = asLoan(this.lastResponse.body).id;
  }
});

When(/^(.+) tries to borrow "(.+)"$/, async function (memberName: string, bookTitle: string) {
  const memberId = this.context[`member_${memberName}`];
  const bookId = this.context[`book_${bookTitle}`];
  this.lastResponse = await httpRequest(this.baseUrl, '/api/loans', 'POST', {
    member_id: memberId, book_id: bookId,
  });
});

When(/^(.+) tries to borrow another book$/, async function (memberName: string) {
  const memberId = this.context[`member_${memberName}`];
  const res = await httpRequest(this.baseUrl, '/api/books', 'POST', {
    title: `Extra-${Date.now()}`, author: 'A', isbn: `${Date.now()}`.slice(0, 13).padEnd(13, '0'), total_copies: 3,
  });
  this.lastResponse = await httpRequest(this.baseUrl, '/api/loans', 'POST', {
    member_id: memberId, book_id: asBook(res.body).id,
  });
});

When(/^(.+) returns the loan$/, async function (memberName: string) {
  const memberId = this.context[`member_${memberName}`];
  const loan = this.db.prepare(
    'SELECT id FROM loans WHERE member_id = ? AND returned_at IS NULL ORDER BY borrowed_at ASC LIMIT 1'
  ).get(memberId) as { id: string } | undefined;
  if (loan) {
    this.context[`loanId_${memberName}`] = loan.id;
    this.lastResponse = await httpRequest(this.baseUrl, `/api/loans/${loan.id}/return`, 'POST');
  } else {
    this.lastResponse = { status: 404, body: { error: 'Loan not found' } as Record<string, unknown> };
  }
});

When(/^(.+) tries to return the same loan again$/, async function (memberName: string) {
  const loanId = this.context[`loanId_${memberName}`];
  this.lastResponse = await httpRequest(this.baseUrl, `/api/loans/${loanId}/return`, 'POST');
});

When(/^(.+) reserves "(.+)"$/, async function (memberName: string, bookTitle: string) {
  const memberId = this.context[`member_${memberName}`];
  const bookId = this.context[`book_${bookTitle}`];
  this.lastResponse = await httpRequest(this.baseUrl, '/api/reservations', 'POST', {
    member_id: memberId, book_id: bookId,
  });
});

When(/^(.+) tries to reserve "(.+)"$/, async function (memberName: string, bookTitle: string) {
  const memberId = this.context[`member_${memberName}`];
  const bookId = this.context[`book_${bookTitle}`];
  this.lastResponse = await httpRequest(this.baseUrl, '/api/reservations', 'POST', {
    member_id: memberId, book_id: bookId,
  });
});

When(/^(.+) tries to reserve "(.+)" again$/, async function (memberName: string, bookTitle: string) {
  const memberId = this.context[`member_${memberName}`];
  const bookId = this.context[`book_${bookTitle}`];
  this.lastResponse = await httpRequest(this.baseUrl, '/api/reservations', 'POST', {
    member_id: memberId, book_id: bookId,
  });
});

When(/^the book is returned and (.+) is notified$/, async function (_name: string) {
  const duneBook = this.db.prepare("SELECT id FROM books WHERE title = 'Dune'").get() as { id: string } | undefined;
  if (!duneBook) return;
  const loan = this.db.prepare(
    'SELECT id FROM loans WHERE book_id = ? AND returned_at IS NULL LIMIT 1'
  ).get(duneBook.id) as { id: string } | undefined;
  if (loan) {
    await httpRequest(this.baseUrl, `/api/loans/${loan.id}/return`, 'POST');
  }
});

When('reservations are expired', async function () {
  this.lastResponse = await httpRequest(this.baseUrl, '/api/reservations/expire', 'POST');
});

function findMemberId(context: Record<string, string>, name: string): string | undefined {
  if (context[`member_${name}`]) return context[`member_${name}`];
  for (const [key, value] of Object.entries(context)) {
    if (key.startsWith('member_') && key.endsWith(name)) return value;
    if (key.startsWith('member_') && key.includes(name.replace(/\s+/g, ' '))) return value;
  }
  return undefined;
}

When(/^the librarian requests (.+)'s member profile$/, async function (memberName: string) {
  const memberId = findMemberId(this.context, memberName);
  if (!memberId) {
    this.lastResponse = { status: 404, body: { error: 'Member not found' } as Record<string, unknown> };
    return;
  }
  const r = await httpRequest(this.baseUrl, `/api/members/${memberId}`, 'GET');
  this.lastResponse = r;
});

When(/^(.+) can borrow "(.+)"$/, async function (memberName: string, bookTitle: string) {
  const memberId = this.context[`member_${memberName}`];
  const bookId = this.context[`book_${bookTitle}`];
  this.lastResponse = await httpRequest(this.baseUrl, '/api/loans', 'POST', {
    member_id: memberId, book_id: bookId,
  });
});

When(/^another member cannot borrow "(.+)"$/, async function (bookTitle: string) {
  const res = await httpRequest(this.baseUrl, '/api/members', 'POST', {
    name: 'Stranger', email: `stranger-${Date.now()}@test.com`,
  });
  const bookId = this.context[`book_${bookTitle}`];
  this.lastResponse = await httpRequest(this.baseUrl, '/api/loans', 'POST', {
    member_id: asMember(res.body).id, book_id: bookId,
  });
});

When('the librarian pays the fine', async function () {
  const fineId = this.context['fine_Alice Johnson'];
  this.lastResponse = await httpRequest(this.baseUrl, `/api/fines/${fineId}/pay`, 'POST');
});

When('the librarian tries to pay that fine again', async function () {
  const fineId = this.context['fine_Alice Johnson'];
  await httpRequest(this.baseUrl, `/api/fines/${fineId}/pay`, 'POST');
  this.lastResponse = await httpRequest(this.baseUrl, `/api/fines/${fineId}/pay`, 'POST');
});

// --- Then steps ---

Then('the response status is {int}', function (status: number) {
  assert.strictEqual(this.lastResponse.status, status);
});

Then('the response contains {int} books', function (count: number) {
  const body = this.lastResponse.body;
  assert.strictEqual(Array.isArray(body) ? body.length : 0, count);
});

Then('the books are sorted by title alphabetically', function () {
  const books = asBooks(this.lastResponse.body);
  const titles = books.map((b) => b.title);
  const sorted = [...titles].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  assert.deepStrictEqual(titles, sorted);
});

Then('the book has a queue_depth field', function () {
  assert.ok(this.lastResponse.body && 'queue_depth' in this.lastResponse.body);
});

Then('the book has {int} available copies', function (count: number) {
  const body = this.lastResponse.body as { available_copies: number };
  assert.strictEqual(body.available_copies, count);
});

Then('the error message is {string}', function (message: string) {
  const body = this.lastResponse.body;
  assert.strictEqual(body && typeof body === 'object' && 'error' in body ? String((body as Record<string, unknown>).error) : undefined, message);
});

Then('the book title is {string}', function (title: string) {
  const body = this.lastResponse.body as { title: string };
  assert.strictEqual(body.title, title);
});

Then('the member name is {string}', function (name: string) {
  const body = this.lastResponse.body as { name: string };
  assert.strictEqual(body.name, name);
});

Then('the loan has a due_date', function () {
  const body = this.lastResponse.body as { due_at: string };
  assert.ok(body.due_at);
});

Then(/^"(.+)" has (\d+) available copies$/, async function (bookTitle: string, count: string) {
  const bookId = this.context[`book_${bookTitle}`];
  const res = await httpRequest(this.baseUrl, `/api/books/${bookId}`, 'GET');
  const body = asBook(res.body);
  assert.strictEqual(body.available_copies, Number(count));
});

Then('the loan is marked as returned', function () {
  const body = this.lastResponse.body as { loan: { returned_at: string } };
  assert.ok(body.loan?.returned_at);
});

Then(/^a fine of \$(\d+\.\d+) is created for the loan$/, function (amount: string) {
  const body = asReturnRes(this.lastResponse.body);
  assert.strictEqual(body.fineCreated, true);
  const loanId = body.loan.id;
  const fines = this.db.prepare('SELECT * FROM fines WHERE loan_id = ?').all(loanId) as FineRow[];
  const total = fines.reduce((sum: number, f: FineRow) => sum + f.amount_cents, 0);
  assert.strictEqual(total, Math.round(Number(amount) * 100));
});

Then(/^(.+)'s reservation status becomes "(.+)"$/, async function (memberName: string, expectedStatus: string) {
  const bookId = this.context['book_Dune'];
  const memberId = this.context[`member_${memberName}`];
  const reservations = this.db.prepare(
    "SELECT * FROM reservations WHERE book_id = ? AND member_id = ?",
  ).all(bookId, memberId) as ReservationRow[];
  assert.ok(reservations.length > 0, `${memberName} has no reservations`);
  assert.strictEqual(reservations[0].status, expectedStatus);
});

Then(/^"(.+)" has (\d+) available copies after return$/, async function (bookTitle: string, count: string) {
  const bookId = this.context[`book_${bookTitle}`];
  const res = await httpRequest(this.baseUrl, `/api/books/${bookId}`, 'GET');
  const body = asBook(res.body);
  assert.strictEqual(body.available_copies, Number(count));
});

Then(/^the book "(.+)" shows (\d+) available of (\d+) copies$/, async function (title: string, avail: string, total: string) {
  const bookId = this.context[`book_${title}`];
  const res = await httpRequest(this.baseUrl, `/api/books/${bookId}`, 'GET');
  const body = asBook(res.body);
  assert.strictEqual(body.available_copies, Number(avail));
  assert.strictEqual(body.total_copies, Number(total));
});

Then('the reservation status is {string}', function (expectedStatus: string) {
  const body = this.lastResponse.body as { status: string };
  assert.strictEqual(body.status, expectedStatus);
});

Then('the fine is marked as paid', function () {
  const body = this.lastResponse.body as { paid_at: string };
  assert.ok(body.paid_at);
});

Then('the response includes unpaid_fines_cents of {int}', function (amount: number) {
  const body = this.lastResponse.body as { unpaid_fines_cents: number };
  assert.strictEqual(body.unpaid_fines_cents, amount);
});

Then(/^(.+)'s reservation status is "(.+)"$/, async function (memberName: string, expectedStatus: string) {
  const bookId = this.context['book_Dune'];
  const memberId = this.context[`member_${memberName}`];
  const reservations = this.db.prepare(
    "SELECT * FROM reservations WHERE book_id = ? AND member_id = ?",
  ).all(bookId, memberId) as ReservationRow[];
  assert.ok(reservations.length > 0, `${memberName} has no reservations`);
  assert.strictEqual(reservations[0].status, expectedStatus);
});
