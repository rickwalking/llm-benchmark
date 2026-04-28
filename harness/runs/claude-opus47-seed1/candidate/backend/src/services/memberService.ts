import { v4 as uuidv4 } from 'uuid';
import type { DB } from '../db/index.js';
import { ConflictError, NotFoundError } from '../errors.js';
import { expireStaleReservations } from './reservationService.js';
import type {
  FineView,
  LoanView,
  MemberDetailView,
  MemberRow,
  ReservationView,
} from '../types.js';

export interface CreateMemberInput {
  name: string;
  email: string;
}

export function listMembers(db: DB): MemberRow[] {
  return db
    .prepare(
      'SELECT id, name, email, member_since, status FROM members ORDER BY name COLLATE NOCASE ASC',
    )
    .all() as MemberRow[];
}

export function getMemberRow(db: DB, id: string): MemberRow {
  const row = db
    .prepare('SELECT id, name, email, member_since, status FROM members WHERE id = ?')
    .get(id) as MemberRow | undefined;
  if (!row) {
    throw new NotFoundError('Member not found');
  }
  return row;
}

export function getMemberDetail(db: DB, id: string): MemberDetailView {
  const member = getMemberRow(db, id);

  expireStaleReservations(db);

  const activeLoans = db
    .prepare(
      `SELECT l.id, l.book_id, l.member_id, l.borrowed_at, l.due_at, l.returned_at,
              b.title AS book_title, b.author AS book_author
         FROM loans l
         JOIN books b ON b.id = l.book_id
        WHERE l.member_id = ? AND l.returned_at IS NULL
        ORDER BY l.due_at ASC`,
    )
    .all(id) as LoanView[];

  const reservationsRaw = db
    .prepare(
      `SELECT r.id, r.book_id, r.member_id, r.queued_at, r.status, r.notified_at, r.expires_at,
              b.title AS book_title
         FROM reservations r
         JOIN books b ON b.id = r.book_id
        WHERE r.member_id = ? AND r.status IN ('waiting','notified')
        ORDER BY r.queued_at ASC`,
    )
    .all(id) as ReservationView[];

  const reservations: ReservationView[] = reservationsRaw.map((r) => {
    const positionRow = db
      .prepare(
        `SELECT COUNT(*) AS n FROM reservations
          WHERE book_id = ? AND status IN ('waiting','notified')
            AND queued_at < ?`,
      )
      .get(r.book_id, r.queued_at) as { n: number };
    return { ...r, position: positionRow.n + 1 };
  });

  const unpaidFines = db
    .prepare(
      `SELECT f.id, f.member_id, f.loan_id, f.amount_cents, f.paid_at, f.created_at,
              b.title AS book_title
         FROM fines f
         JOIN loans l ON l.id = f.loan_id
         JOIN books b ON b.id = l.book_id
        WHERE f.member_id = ? AND f.paid_at IS NULL
        ORDER BY f.created_at ASC`,
    )
    .all(id) as FineView[];

  const unpaidFinesCents = unpaidFines.reduce((acc, f) => acc + f.amount_cents, 0);

  return {
    ...member,
    active_loans: activeLoans,
    reservations,
    unpaid_fines: unpaidFines,
    unpaid_fines_cents: unpaidFinesCents,
  };
}

export function createMember(db: DB, input: CreateMemberInput): MemberRow {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM members WHERE email = ?').get(email);
  if (existing) {
    throw new ConflictError('Email already exists');
  }

  const id = uuidv4();
  const memberSince = new Date().toISOString().slice(0, 10);
  db.prepare(
    "INSERT INTO members (id, name, email, member_since, status) VALUES (?, ?, ?, ?, 'active')",
  ).run(id, name, email, memberSince);

  return {
    id,
    name,
    email,
    member_since: memberSince,
    status: 'active',
  };
}

export function unpaidFinesCentsFor(db: DB, memberId: string): number {
  const row = db
    .prepare(
      'SELECT COALESCE(SUM(amount_cents), 0) AS total FROM fines WHERE member_id = ? AND paid_at IS NULL',
    )
    .get(memberId) as { total: number };
  return row.total;
}

export function activeLoanCountFor(db: DB, memberId: string): number {
  const row = db
    .prepare(
      'SELECT COUNT(*) AS n FROM loans WHERE member_id = ? AND returned_at IS NULL',
    )
    .get(memberId) as { n: number };
  return row.n;
}
