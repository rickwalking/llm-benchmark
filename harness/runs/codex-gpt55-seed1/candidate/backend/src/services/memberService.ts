import { randomUUID } from "node:crypto";

import { ConflictError } from "../errors";
import type { Db } from "./dbTypes";
import type { FineWithLoan, MemberRow, NamedLoan, ReservationRow, ReservationWithBook } from "./types";
import { getMemberRow, getUnpaidFinesCents, normalizeEmail, queuePosition } from "./serviceHelpers";

export type MemberDetail = MemberRow & {
  unpaid_fines_cents: number;
  active_loans: NamedLoan[];
  reservations: ReservationWithBook[];
  unpaid_fines: FineWithLoan[];
};

export function listMembers(db: Db): MemberRow[] {
  return db
    .prepare("SELECT id, name, email, member_since, status FROM members ORDER BY lower(name), name")
    .all() as MemberRow[];
}

export function createMember(db: Db, input: { name: string; email: string }): MemberRow {
  const emailNormalized = normalizeEmail(input.email);
  const existing = db.prepare("SELECT id FROM members WHERE email_normalized = ?").get(emailNormalized);
  if (existing) {
    throw new ConflictError("Email already exists");
  }
  const id = randomUUID();
  const memberSince = new Date().toISOString();
  db.prepare(
    "INSERT INTO members (id, name, email, email_normalized, member_since, status) VALUES (?, ?, ?, ?, ?, 'active')"
  ).run(id, input.name.trim(), input.email.trim(), emailNormalized, memberSince);
  return getMemberRow(db, id);
}

export function getMember(db: Db, memberId: string): MemberDetail {
  const member = getMemberRow(db, memberId);
  const activeLoans = db
    .prepare(
      `
      SELECT l.id, l.book_id, l.member_id, l.borrowed_at, l.due_at, l.returned_at,
        b.title AS book_title, b.author AS book_author
      FROM loans l
      JOIN books b ON b.id = l.book_id
      WHERE l.member_id = ? AND l.returned_at IS NULL
      ORDER BY l.due_at ASC
    `
    )
    .all(memberId) as NamedLoan[];
  const reservations = (
    db
      .prepare(
        `
        SELECT r.id, r.book_id, r.member_id, r.queued_at, r.status, r.notified_at, r.expires_at,
          b.title AS book_title
        FROM reservations r
        JOIN books b ON b.id = r.book_id
        WHERE r.member_id = ? AND r.status IN ('waiting', 'notified')
        ORDER BY r.queued_at ASC
      `
      )
      .all(memberId) as (ReservationRow & { book_title: string })[]
  ).map((reservation) => ({ ...reservation, queue_position: queuePosition(db, reservation) }));
  const unpaidFines = db
    .prepare(
      `
      SELECT f.id, f.member_id, f.loan_id, f.amount_cents, f.paid_at, b.title AS book_title, l.due_at
      FROM fines f
      JOIN loans l ON l.id = f.loan_id
      JOIN books b ON b.id = l.book_id
      WHERE f.member_id = ? AND f.paid_at IS NULL
      ORDER BY f.amount_cents DESC, f.id
    `
    )
    .all(memberId) as FineWithLoan[];
  return {
    ...member,
    unpaid_fines_cents: getUnpaidFinesCents(db, memberId),
    active_loans: activeLoans,
    reservations,
    unpaid_fines: unpaidFines
  };
}
