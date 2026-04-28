import { Given, Then, When, DataTable } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { LibraryWorld } from '../support/world.js';

function isbnFor(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i += 1) {
    hash = (hash * 31 + title.charCodeAt(i)) >>> 0;
  }
  const digits = String(hash).padStart(10, '0').slice(-10);
  return `978${digits}`;
}

async function ensureBook(world: LibraryWorld, title: string, copies = 1, author = 'Test Author'): Promise<string> {
  if (world.catalog.books[title]) return world.catalog.books[title];
  const res = await world.agent().post('/api/books').send({
    title,
    author,
    isbn: isbnFor(title),
    total_copies: copies,
  });
  assert.equal(res.status, 201, `expected to create "${title}", got ${res.status}: ${res.text}`);
  world.catalog.books[title] = res.body.id;
  return res.body.id;
}

async function ensureMember(world: LibraryWorld, name: string): Promise<string> {
  if (world.catalog.members[name]) return world.catalog.members[name];
  const email = `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`;
  const res = await world.agent().post('/api/members').send({ name, email });
  assert.equal(res.status, 201, `expected to create "${name}", got ${res.status}: ${res.text}`);
  world.catalog.members[name] = res.body.id;
  return res.body.id;
}

Given('the library has the following books:', async function (this: LibraryWorld, table: DataTable) {
  for (const row of table.hashes()) {
    const copies = Number(row.copies ?? row.total_copies ?? 1);
    await ensureBook(this, row.title, copies, row.author ?? 'Test Author');
  }
});

Given('the library has a book {string} with {int} copies', async function (
  this: LibraryWorld,
  title: string,
  copies: number,
) {
  await ensureBook(this, title, copies);
});

Given('the library has a book {string}', async function (this: LibraryWorld, title: string) {
  await ensureBook(this, title, 1);
});

Given('the library has the following members:', async function (this: LibraryWorld, table: DataTable) {
  for (const row of table.hashes()) {
    await ensureMember(this, row.name);
  }
});

Given('a member named {string}', async function (this: LibraryWorld, name: string) {
  await ensureMember(this, name);
});

Given('the librarian is acting as {string}', function (this: LibraryWorld, name: string) {
  this.currentMember = this.memberId(name);
});

Given('{string} is suspended', async function (this: LibraryWorld, name: string) {
  const id = this.memberId(name);
  this.db.prepare("UPDATE members SET status = 'suspended' WHERE id = ?").run(id);
});

Given('{string} has {int} active loans', async function (
  this: LibraryWorld,
  name: string,
  count: number,
) {
  for (let i = 0; i < count; i += 1) {
    const title = `Filler Book ${i + 1}`;
    await ensureBook(this, title, 1);
    const res = await this.agent().post('/api/loans').send({
      member_id: this.memberId(name),
      book_id: this.bookId(title),
    });
    assert.equal(res.status, 201, `expected loan ${i + 1} created, got ${res.status}: ${res.text}`);
  }
});

Given('{string} has unpaid fines totaling ${int}.{int}', async function (
  this: LibraryWorld,
  name: string,
  dollars: number,
  cents: number,
) {
  // Create a quick loan, return it overdue, leave fine unpaid.
  const memberId = this.memberId(name);
  const fillerTitle = `Fines Source for ${name}`;
  await ensureBook(this, fillerTitle, 1);
  const bookId = this.bookId(fillerTitle);
  const loanRes = await this.agent().post('/api/loans').send({ member_id: memberId, book_id: bookId });
  assert.equal(loanRes.status, 201);
  const loanId = loanRes.body.id;
  const totalCents = dollars * 100 + cents;
  this.db
    .prepare(
      "INSERT INTO fines (id, member_id, loan_id, amount_cents) VALUES (lower(hex(randomblob(16))), ?, ?, ?)",
    )
    .run(memberId, loanId, totalCents);
});

Given('{string} borrowed {string}', async function (
  this: LibraryWorld,
  name: string,
  title: string,
) {
  const res = await this.agent().post('/api/loans').send({
    member_id: this.memberId(name),
    book_id: this.bookId(title),
  });
  assert.equal(res.status, 201, `borrow failed: ${res.text}`);
  this.lastResponse = res;
});

Given('{string} borrowed {string} {int} days ago', async function (
  this: LibraryWorld,
  name: string,
  title: string,
  daysAgo: number,
) {
  const res = await this.agent().post('/api/loans').send({
    member_id: this.memberId(name),
    book_id: this.bookId(title),
  });
  assert.equal(res.status, 201, `borrow failed: ${res.text}`);
  await this.agent().post('/api/dev/backdate-loan').send({ loan_id: res.body.id, days: daysAgo });
  this.lastResponse = res;
});

Given('{string} reserved {string}', async function (
  this: LibraryWorld,
  name: string,
  title: string,
) {
  const res = await this.agent().post('/api/reservations').send({
    member_id: this.memberId(name),
    book_id: this.bookId(title),
  });
  assert.equal(res.status, 201, `reserve failed: ${res.text}`);
});

When('the librarian lends {string} to {string}', async function (
  this: LibraryWorld,
  title: string,
  name: string,
) {
  this.lastResponse = await this.agent().post('/api/loans').send({
    member_id: this.memberId(name),
    book_id: this.bookId(title),
  });
});

When('the librarian tries to lend {string} to {string}', async function (
  this: LibraryWorld,
  title: string,
  name: string,
) {
  this.lastResponse = await this.agent().post('/api/loans').send({
    member_id: this.memberId(name),
    book_id: this.bookId(title),
  });
});

When('the librarian returns {string} from {string}', async function (
  this: LibraryWorld,
  title: string,
  name: string,
) {
  const memberId = this.memberId(name);
  const bookId = this.bookId(title);
  const loan = this.db
    .prepare(
      'SELECT id FROM loans WHERE member_id = ? AND book_id = ? AND returned_at IS NULL',
    )
    .get(memberId, bookId) as { id: string } | undefined;
  assert.ok(loan, `no active loan for ${name} of ${title}`);
  this.lastResponse = await this.agent().post(`/api/loans/${loan.id}/return`);
});

When('the librarian returns {string} from {string} {int} days late', async function (
  this: LibraryWorld,
  title: string,
  name: string,
  daysLate: number,
) {
  const memberId = this.memberId(name);
  const bookId = this.bookId(title);
  const loan = this.db
    .prepare(
      'SELECT id FROM loans WHERE member_id = ? AND book_id = ? AND returned_at IS NULL',
    )
    .get(memberId, bookId) as { id: string } | undefined;
  assert.ok(loan, `no active loan for ${name} of ${title}`);
  // Backdate so due_at falls precisely `daysLate` days in the past, accounting for the
  // small wall-clock drift between borrow and return calls (subtract a 60-second buffer).
  const seconds = (daysLate + 14) * 86400 - 60;
  await this.agent().post('/api/dev/backdate-loan').send({
    loan_id: loan.id,
    seconds,
  });
  this.lastResponse = await this.agent().post(`/api/loans/${loan.id}/return`);
});

When('{string} reserves {string}', async function (this: LibraryWorld, name: string, title: string) {
  this.lastResponse = await this.agent().post('/api/reservations').send({
    member_id: this.memberId(name),
    book_id: this.bookId(title),
  });
});

When('{string} tries to reserve {string}', async function (
  this: LibraryWorld,
  name: string,
  title: string,
) {
  this.lastResponse = await this.agent().post('/api/reservations').send({
    member_id: this.memberId(name),
    book_id: this.bookId(title),
  });
});

When('{string} pays the fine', async function (this: LibraryWorld, name: string) {
  const memberId = this.memberId(name);
  const fine = this.db
    .prepare('SELECT id FROM fines WHERE member_id = ? AND paid_at IS NULL LIMIT 1')
    .get(memberId) as { id: string } | undefined;
  assert.ok(fine, `no unpaid fine for ${name}`);
  this.lastResponse = await this.agent().post(`/api/fines/${fine.id}/pay`);
});

When('the librarian pays the same fine again', async function (this: LibraryWorld) {
  // The fine just paid - find any paid fine
  const fine = this.db
    .prepare('SELECT id FROM fines WHERE paid_at IS NOT NULL ORDER BY paid_at DESC LIMIT 1')
    .get() as { id: string } | undefined;
  assert.ok(fine, 'expected a previously-paid fine');
  this.lastResponse = await this.agent().post(`/api/fines/${fine.id}/pay`);
});

When('the reservation notification window passes', async function (this: LibraryWorld) {
  // Find currently notified reservations and backdate them past expiry.
  const notified = this.db
    .prepare("SELECT id FROM reservations WHERE status = 'notified'")
    .all() as Array<{ id: string }>;
  for (const r of notified) {
    await this.agent().post('/api/dev/backdate-reservation').send({
      reservation_id: r.id,
      hours: 49,
    });
  }
  this.lastResponse = await this.agent().post('/api/reservations/expire');
});

When('the librarian fetches the catalog', async function (this: LibraryWorld) {
  this.lastResponse = await this.agent().get('/api/books');
});

When('the librarian fetches book {string}', async function (this: LibraryWorld, title: string) {
  this.lastResponse = await this.agent().get(`/api/books/${this.bookId(title)}`);
});

When('the librarian fetches a non-existent book', async function (this: LibraryWorld) {
  this.lastResponse = await this.agent().get('/api/books/00000000-0000-0000-0000-000000000000');
});

When('the librarian adds a book {string} by {string} with ISBN {string} and {int} copies', async function (
  this: LibraryWorld,
  title: string,
  author: string,
  isbn: string,
  copies: number,
) {
  this.lastResponse = await this.agent().post('/api/books').send({
    title,
    author,
    isbn,
    total_copies: copies,
  });
  if (this.lastResponse.status === 201) {
    this.catalog.books[title] = this.lastResponse.body.id;
  }
});

When('the librarian adds a member {string} with email {string}', async function (
  this: LibraryWorld,
  name: string,
  email: string,
) {
  this.lastResponse = await this.agent().post('/api/members').send({ name, email });
  if (this.lastResponse.status === 201) {
    this.catalog.members[name] = this.lastResponse.body.id;
  }
});

When('the librarian opens {string}’s profile', async function (
  this: LibraryWorld,
  name: string,
) {
  this.lastResponse = await this.agent().get(`/api/members/${this.memberId(name)}`);
});

Then('the request succeeds with status {int}', function (this: LibraryWorld, status: number) {
  assert.ok(this.lastResponse, 'no last response');
  assert.equal(
    this.lastResponse!.status,
    status,
    `expected ${status}, got ${this.lastResponse!.status}: ${this.lastResponse!.text}`,
  );
});

Then('the request fails with status {int}', function (this: LibraryWorld, status: number) {
  assert.ok(this.lastResponse, 'no last response');
  assert.equal(
    this.lastResponse!.status,
    status,
    `expected ${status}, got ${this.lastResponse!.status}: ${this.lastResponse!.text}`,
  );
});

Then('the response error message is {string}', function (this: LibraryWorld, message: string) {
  assert.ok(this.lastResponse, 'no last response');
  assert.equal(this.lastResponse!.body.error, message);
});

Then('the loan due date is {int} days from today', function (this: LibraryWorld, days: number) {
  assert.ok(this.lastResponse, 'no last response');
  const dueAt = new Date(this.lastResponse!.body.due_at);
  const expected = new Date(Date.now() + days * 86400_000);
  const delta = Math.abs(dueAt.getTime() - expected.getTime());
  assert.ok(delta < 60_000, `expected due_at ~ ${expected.toISOString()}, got ${dueAt.toISOString()}`);
});

Then('the catalog is sorted by title case-insensitively', function (this: LibraryWorld) {
  assert.ok(this.lastResponse, 'no last response');
  const titles = (this.lastResponse!.body as Array<{ title: string }>).map((b) => b.title.toLowerCase());
  for (let i = 1; i < titles.length; i += 1) {
    assert.ok(titles[i - 1] <= titles[i], `not sorted: ${titles[i - 1]} > ${titles[i]}`);
  }
});

Then('{string} has a {int} cent fine', function (
  this: LibraryWorld,
  name: string,
  cents: number,
) {
  const memberId = this.memberId(name);
  const total = (
    this.db
      .prepare('SELECT COALESCE(SUM(amount_cents),0) AS t FROM fines WHERE member_id = ?')
      .get(memberId) as { t: number }
  ).t;
  assert.equal(total, cents);
});

Then('{string} has no fine', function (this: LibraryWorld, name: string) {
  const memberId = this.memberId(name);
  const count = (
    this.db
      .prepare('SELECT COUNT(*) AS n FROM fines WHERE member_id = ?')
      .get(memberId) as { n: number }
  ).n;
  assert.equal(count, 0);
});

Then('{string} has {int} unpaid fines totaling ${int}.{int}', function (
  this: LibraryWorld,
  name: string,
  count: number,
  dollars: number,
  cents: number,
) {
  const memberId = this.memberId(name);
  const rows = this.db
    .prepare('SELECT amount_cents FROM fines WHERE member_id = ? AND paid_at IS NULL')
    .all(memberId) as Array<{ amount_cents: number }>;
  assert.equal(rows.length, count);
  const total = rows.reduce((acc, r) => acc + r.amount_cents, 0);
  assert.equal(total, dollars * 100 + cents);
});

Then('the book {string} is not in the catalog', function (this: LibraryWorld, title: string) {
  const row = this.db.prepare('SELECT id FROM books WHERE title = ?').get(title);
  assert.equal(row, undefined);
});

Then('the book {string} is in the catalog', function (this: LibraryWorld, title: string) {
  const row = this.db.prepare('SELECT id FROM books WHERE title = ?').get(title);
  assert.ok(row);
});

Then('the reservation queue depth for {string} is {int}', async function (
  this: LibraryWorld,
  title: string,
  depth: number,
) {
  const res = await this.agent().get(`/api/books/${this.bookId(title)}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.reservation_queue_depth, depth);
});

Then('{string}’s reservation for {string} is in status {string}', function (
  this: LibraryWorld,
  name: string,
  title: string,
  status: string,
) {
  const memberId = this.memberId(name);
  const bookId = this.bookId(title);
  const row = this.db
    .prepare('SELECT status FROM reservations WHERE member_id = ? AND book_id = ? ORDER BY queued_at DESC LIMIT 1')
    .get(memberId, bookId) as { status: string } | undefined;
  assert.ok(row, `no reservation for ${name} on ${title}`);
  assert.equal(row!.status, status);
});

Then('{string} now has {int} active loans', function (
  this: LibraryWorld,
  name: string,
  count: number,
) {
  const memberId = this.memberId(name);
  const n = (
    this.db
      .prepare(
        'SELECT COUNT(*) AS n FROM loans WHERE member_id = ? AND returned_at IS NULL',
      )
      .get(memberId) as { n: number }
  ).n;
  assert.equal(n, count);
});

Then('{string} now has {int} unpaid fines', function (
  this: LibraryWorld,
  name: string,
  count: number,
) {
  const memberId = this.memberId(name);
  const n = (
    this.db
      .prepare('SELECT COUNT(*) AS n FROM fines WHERE member_id = ? AND paid_at IS NULL')
      .get(memberId) as { n: number }
  ).n;
  assert.equal(n, count);
});

Then('the available copies of {string} is {int}', async function (
  this: LibraryWorld,
  title: string,
  copies: number,
) {
  const res = await this.agent().get(`/api/books/${this.bookId(title)}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.available_copies, copies);
});

Then('the response includes a warning containing {string}', function (
  this: LibraryWorld,
  fragment: string,
) {
  assert.ok(this.lastResponse, 'no last response');
  const warnings = (this.lastResponse!.body.warnings ?? []) as string[];
  assert.ok(
    warnings.some((w) => w.includes(fragment)),
    `expected warning containing "${fragment}", got ${JSON.stringify(warnings)}`,
  );
});
