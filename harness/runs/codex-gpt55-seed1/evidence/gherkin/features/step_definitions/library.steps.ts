import { DataTable, Given, Then, When } from "@cucumber/cucumber";
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";

import type { FineRow, LoanRow, ReservationRow } from "../../backend/src/services/types";
import type { LibraryWorld } from "../support/world";

type BookTableRow = { title: string; author: string; isbn: string; copies: string };
type MemberTableRow = { name: string; email: string };

function record(value: unknown): Record<string, unknown> {
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);
  return value as Record<string, unknown>;
}

function array(value: unknown): Record<string, unknown>[] {
  assert.ok(Array.isArray(value));
  return value.map(record);
}

async function createLoan(world: LibraryWorld, memberName: string, bookTitle: string): Promise<LoanRow> {
  const body = await world.request("/api/loans", {
    method: "POST",
    body: JSON.stringify({ member_id: world.memberId(memberName), book_id: world.bookId(bookTitle) })
  });
  return record(body) as LoanRow;
}

function findLoan(world: LibraryWorld, memberName: string, bookTitle: string): LoanRow {
  const row = world
    .requireDb()
    .prepare(
      `
      SELECT l.id, l.book_id, l.member_id, l.borrowed_at, l.due_at, l.returned_at
      FROM loans l
      JOIN books b ON b.id = l.book_id
      WHERE l.member_id = ? AND b.title = ?
      ORDER BY l.borrowed_at DESC
      LIMIT 1
    `
    )
    .get(world.memberId(memberName), bookTitle) as LoanRow | undefined;
  assert.ok(row, `Expected ${memberName} to have a loan for ${bookTitle}`);
  return row;
}

function findReservation(world: LibraryWorld, memberName: string, bookTitle: string): ReservationRow {
  const row = world
    .requireDb()
    .prepare(
      `
      SELECT r.id, r.book_id, r.member_id, r.queued_at, r.status, r.notified_at, r.expires_at
      FROM reservations r
      JOIN books b ON b.id = r.book_id
      WHERE r.member_id = ? AND b.title = ?
      ORDER BY r.queued_at DESC
      LIMIT 1
    `
    )
    .get(world.memberId(memberName), bookTitle) as ReservationRow | undefined;
  assert.ok(row, `Expected ${memberName} to have a reservation for ${bookTitle}`);
  return row;
}

Given("the catalog contains books", async function (this: LibraryWorld, table: DataTable) {
  for (const row of table.hashes() as BookTableRow[]) {
    const body = await this.request("/api/books", {
      method: "POST",
      body: JSON.stringify({
        title: row.title,
        author: row.author,
        isbn: row.isbn,
        total_copies: Number(row.copies)
      })
    });
    this.books.set(row.title, String(record(body).id));
  }
});

Given("members exist", async function (this: LibraryWorld, table: DataTable) {
  for (const row of table.hashes() as MemberTableRow[]) {
    const body = await this.request("/api/members", {
      method: "POST",
      body: JSON.stringify({ name: row.name, email: row.email })
    });
    this.members.set(row.name, String(record(body).id));
  }
});

Given("{word} is suspended", function (this: LibraryWorld, memberName: string) {
  this.requireDb().prepare("UPDATE members SET status = 'suspended' WHERE id = ?").run(this.memberId(memberName));
});

Given("{word} has borrowed {string}", async function (this: LibraryWorld, memberName: string, bookTitle: string) {
  await createLoan(this, memberName, bookTitle);
});

Given("{word} has borrowed five books", async function (this: LibraryWorld, memberName: string) {
  for (const title of Array.from(this.books.keys()).slice(1, 6)) {
    await createLoan(this, memberName, title);
  }
});

Given("{word} has borrowed four books", async function (this: LibraryWorld, memberName: string) {
  for (const title of Array.from(this.books.keys()).slice(1, 5)) {
    await createLoan(this, memberName, title);
  }
});

Given("{word} has unpaid fines of {int} cents", async function (this: LibraryWorld, memberName: string, amount: number) {
  const firstBook = Array.from(this.books.keys())[0];
  const existing = this
    .requireDb()
    .prepare("SELECT id, book_id, member_id, borrowed_at, due_at, returned_at FROM loans WHERE member_id = ? LIMIT 1")
    .get(this.memberId(memberName)) as LoanRow | undefined;
  const loan = existing ?? (await createLoan(this, memberName, firstBook));
  const id = randomUUID();
  this.requireDb()
    .prepare("INSERT INTO fines (id, member_id, loan_id, amount_cents, paid_at) VALUES (?, ?, ?, ?, NULL)")
    .run(id, this.memberId(memberName), loan.id, amount);
  this.lastFine = this
    .requireDb()
    .prepare("SELECT id, member_id, loan_id, amount_cents, paid_at FROM fines WHERE id = ?")
    .get(id) as FineRow;
});

Given("{word}'s loan for {string} is {int} days overdue", function (
  this: LibraryWorld,
  memberName: string,
  bookTitle: string,
  days: number
) {
  const loan = findLoan(this, memberName, bookTitle);
  const dueAt = new Date(Date.now() - (days - 0.5) * 24 * 60 * 60 * 1000).toISOString();
  this.requireDb().prepare("UPDATE loans SET due_at = ? WHERE id = ?").run(dueAt, loan.id);
});

Given("{word}'s notification for {string} is stale", function (this: LibraryWorld, memberName: string, bookTitle: string) {
  const reservation = findReservation(this, memberName, bookTitle);
  this.requireDb()
    .prepare("UPDATE reservations SET expires_at = ? WHERE id = ?")
    .run("2000-01-01T00:00:00.000Z", reservation.id);
});

When("the librarian lists the catalog", async function (this: LibraryWorld) {
  await this.request("/api/books");
});

When("the librarian views {string}", async function (this: LibraryWorld, bookTitle: string) {
  await this.request(`/api/books/${this.bookId(bookTitle)}`);
});

When("the librarian views {string} for {word}", async function (
  this: LibraryWorld,
  bookTitle: string,
  memberName: string
) {
  await this.request(`/api/books/${this.bookId(bookTitle)}?member_id=${this.memberId(memberName)}`);
});

When("the librarian views a missing book", async function (this: LibraryWorld) {
  await this.request("/api/books/00000000-0000-4000-8000-000000000000");
});

When("the librarian adds the book {string} with ISBN {string}", async function (
  this: LibraryWorld,
  title: string,
  isbn: string
) {
  await this.request("/api/books", {
    method: "POST",
    body: JSON.stringify({ title, author: "Test Author", isbn, total_copies: 1 })
  });
});

When("the librarian adds member {string} with email {string}", async function (
  this: LibraryWorld,
  name: string,
  email: string
) {
  await this.request("/api/members", { method: "POST", body: JSON.stringify({ name, email }) });
});

When("the librarian lends {string} to {word}", async function (this: LibraryWorld, bookTitle: string, memberName: string) {
  await this.request("/api/loans", {
    method: "POST",
    body: JSON.stringify({ member_id: this.memberId(memberName), book_id: this.bookId(bookTitle) })
  });
});

When("the librarian returns {word}'s loan for {string}", async function (
  this: LibraryWorld,
  memberName: string,
  bookTitle: string
) {
  const loan = findLoan(this, memberName, bookTitle);
  await this.request(`/api/loans/${loan.id}/return`, { method: "POST" });
});

When("{word} reserves {string}", async function (this: LibraryWorld, memberName: string, bookTitle: string) {
  await this.request("/api/reservations", {
    method: "POST",
    body: JSON.stringify({ member_id: this.memberId(memberName), book_id: this.bookId(bookTitle) })
  });
});

When("stale reservations are expired", async function (this: LibraryWorld) {
  await this.request("/api/reservations/expire", { method: "POST" });
});

When("the librarian views member {word}", async function (this: LibraryWorld, memberName: string) {
  await this.request(`/api/members/${this.memberId(memberName)}`);
});

When("the librarian pays {word}'s fine", async function (this: LibraryWorld, memberName: string) {
  const fine =
    this.lastFine ??
    (this
      .requireDb()
      .prepare("SELECT id, member_id, loan_id, amount_cents, paid_at FROM fines WHERE member_id = ? LIMIT 1")
      .get(this.memberId(memberName)) as FineRow | undefined);
  assert.ok(fine, `Expected ${memberName} to have a fine`);
  await this.request(`/api/fines/${fine.id}/pay`, { method: "POST" });
});

Then("the response status is {int}", function (this: LibraryWorld, status: number) {
  assert.equal(this.lastStatus, status);
});

Then("the error is {string}", function (this: LibraryWorld, message: string) {
  assert.equal(record(this.lastBody).error, message);
});

Then("the catalog titles are {string}", function (this: LibraryWorld, titles: string) {
  assert.equal(array(this.lastBody).map((book) => String(book.title)).join(", "), titles);
});

Then("the queue depth is {int}", function (this: LibraryWorld, depth: number) {
  assert.equal(record(this.lastBody).reservation_queue_depth, depth);
});

Then("{string} shows {int} available copy", async function (this: LibraryWorld, bookTitle: string, copies: number) {
  const body = await this.request(`/api/books/${this.bookId(bookTitle)}`);
  assert.equal(record(body).available_copies, copies);
});

Then("{string} shows {int} available copies", async function (this: LibraryWorld, bookTitle: string, copies: number) {
  const body = await this.request(`/api/books/${this.bookId(bookTitle)}`);
  assert.equal(record(body).available_copies, copies);
});

Then("the created book is {string}", function (this: LibraryWorld, title: string) {
  assert.equal(record(this.lastBody).title, title);
});

Then("the created member is {string}", function (this: LibraryWorld, name: string) {
  assert.equal(record(this.lastBody).name, name);
});

Then("{word}'s reservation for {string} is {string}", function (
  this: LibraryWorld,
  memberName: string,
  bookTitle: string,
  status: string
) {
  assert.equal(findReservation(this, memberName, bookTitle).status, status);
});

Then("{word}'s queue position is {int}", function (this: LibraryWorld, memberName: string, position: number) {
  const reservation = record(this.lastBody).selected_member_reservation;
  assert.equal(record(reservation).member_id, this.memberId(memberName));
  assert.equal(record(reservation).queue_position, position);
});

Then("{word} has {int} active loan", function (this: LibraryWorld, _memberName: string, count: number) {
  assert.equal(array(record(this.lastBody).active_loans).length, count);
});

Then("{word} has {int} active loans", function (this: LibraryWorld, _memberName: string, count: number) {
  assert.equal(array(record(this.lastBody).active_loans).length, count);
});

Then("{word}'s unpaid fine total is {int} cents", async function (
  this: LibraryWorld,
  memberName: string,
  amount: number
) {
  const body = await this.request(`/api/members/${this.memberId(memberName)}`);
  assert.equal(record(body).unpaid_fines_cents, amount);
});

Then("{word} has {int} unpaid fine", function (this: LibraryWorld, _memberName: string, count: number) {
  assert.equal(array(record(this.lastBody).unpaid_fines).length, count);
});
