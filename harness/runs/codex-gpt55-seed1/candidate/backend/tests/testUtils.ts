import request from "supertest";
import { randomUUID } from "node:crypto";

import { createApp } from "../src/app";
import { createMemoryDatabase, type Db } from "../src/db";
import type { Book, FineRow, LoanRow, MemberRow, ReservationRow } from "../src/services/types";

let isbnCounter = 1000000000000;

export function makeTestStack(): { db: Db; agent: ReturnType<typeof request> } {
  const db = createMemoryDatabase(false);
  return { db, agent: request(createApp(db)) };
}

export async function createBook(
  agent: ReturnType<typeof request>,
  title: string,
  copies = 1,
  isbn = uniqueIsbn()
): Promise<Book> {
  const response = await agent.post("/api/books").send({
    title,
    author: "Test Author",
    isbn,
    total_copies: copies
  });
  return response.body as Book;
}

export async function createMember(agent: ReturnType<typeof request>, name: string): Promise<MemberRow> {
  const email = `${name.toLowerCase().replaceAll(" ", ".")}.${randomUUID()}@example.com`;
  const response = await agent.post("/api/members").send({ name, email });
  return response.body as MemberRow;
}

export async function borrow(
  agent: ReturnType<typeof request>,
  member: MemberRow,
  book: Book
): Promise<LoanRow> {
  const response = await agent.post("/api/loans").send({ member_id: member.id, book_id: book.id });
  return response.body as LoanRow;
}

export async function reserve(
  agent: ReturnType<typeof request>,
  member: MemberRow,
  book: Book
): Promise<ReservationRow> {
  const response = await agent.post("/api/reservations").send({ member_id: member.id, book_id: book.id });
  return response.body as ReservationRow;
}

export function insertFine(db: Db, member: MemberRow, loan: LoanRow, amountCents: number): FineRow {
  const id = randomUUID();
  db.prepare("INSERT INTO fines (id, member_id, loan_id, amount_cents, paid_at) VALUES (?, ?, ?, ?, NULL)").run(
    id,
    member.id,
    loan.id,
    amountCents
  );
  return db.prepare("SELECT id, member_id, loan_id, amount_cents, paid_at FROM fines WHERE id = ?").get(id) as FineRow;
}

function uniqueIsbn(): string {
  isbnCounter += 1;
  return String(isbnCounter);
}
