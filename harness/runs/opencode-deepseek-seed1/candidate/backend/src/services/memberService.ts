import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import { ConflictError } from '../errors.js';
import type { Member } from '../types.js';

export function listMembers(db: Database.Database): Omit<Member, 'unpaid_fines_cents'>[] {
  return db.prepare('SELECT id, name, email, member_since, status FROM members ORDER BY name COLLATE NOCASE ASC').all() as Omit<Member, 'unpaid_fines_cents'>[];
}

export function getMember(db: Database.Database, id: string): Member | null {
  const row = db.prepare('SELECT id, name, email, member_since, status FROM members WHERE id = ?').get(id) as Omit<Member, 'unpaid_fines_cents'> | undefined;
  if (!row) return null;

  const unpaidFines = db.prepare(
    'SELECT COALESCE(SUM(amount_cents), 0) as total FROM fines WHERE member_id = ? AND paid_at IS NULL',
  ).get(id) as { total: number };

  return { ...row, unpaid_fines_cents: unpaidFines.total };
}

export function createMember(
  db: Database.Database,
  data: { name: string; email: string },
): Member {
  const existing = db.prepare('SELECT id FROM members WHERE email = ?').get(data.email);
  if (existing) {
    throw new ConflictError('Email already exists');
  }

  const id = uuid();
  const memberSince = new Date().toISOString().split('T')[0];

  db.prepare(
    'INSERT INTO members (id, name, email, member_since, status) VALUES (?, ?, ?, ?, ?)',
  ).run(id, data.name, data.email, memberSince, 'active');

  return {
    id,
    name: data.name,
    email: data.email,
    member_since: memberSince,
    status: 'active',
    unpaid_fines_cents: 0,
  };
}

export function getMemberActiveLoans(db: Database.Database, memberId: string): Array<{
  id: string;
  book_title: string;
  book_author: string;
  book_isbn: string;
  borrowed_at: string;
  due_at: string;
  returned_at: string | null;
}> {
  return db.prepare(`
    SELECT l.id, b.title as book_title, b.author as book_author, b.isbn as book_isbn,
           l.borrowed_at, l.due_at, l.returned_at
    FROM loans l
    JOIN books b ON b.id = l.book_id
    WHERE l.member_id = ? AND l.returned_at IS NULL
    ORDER BY l.due_at ASC
  `).all(memberId) as Array<{
    id: string;
    book_title: string;
    book_author: string;
    book_isbn: string;
    borrowed_at: string;
    due_at: string;
    returned_at: string | null;
  }>;
}

export function getMemberReservations(db: Database.Database, memberId: string): Array<{
  id: string;
  book_id: string;
  book_title: string;
  book_author: string;
  queued_at: string;
  status: string;
  notified_at: string | null;
  expires_at: string | null;
}> {
  return db.prepare(`
    SELECT r.id, r.book_id, b.title as book_title, b.author as book_author,
           r.queued_at, r.status, r.notified_at, r.expires_at
    FROM reservations r
    JOIN books b ON b.id = r.book_id
    WHERE r.member_id = ? AND r.status IN ('waiting', 'notified')
    ORDER BY r.queued_at ASC
  `).all(memberId) as Array<{
    id: string;
    book_id: string;
    book_title: string;
    book_author: string;
    queued_at: string;
    status: string;
    notified_at: string | null;
    expires_at: string | null;
  }>;
}

export function getMemberFines(db: Database.Database, memberId: string): Array<{
  id: string;
  loan_id: string;
  book_title: string;
  amount_cents: number;
  paid_at: string | null;
}> {
  return db.prepare(`
    SELECT f.id, f.loan_id, b.title as book_title, f.amount_cents, f.paid_at
    FROM fines f
    JOIN loans l ON l.id = f.loan_id
    JOIN books b ON b.id = l.book_id
    WHERE f.member_id = ?
    ORDER BY f.paid_at IS NULL DESC, f.rowid ASC
  `).all(memberId) as Array<{
    id: string;
    loan_id: string;
    book_title: string;
    amount_cents: number;
    paid_at: string | null;
  }>;
}
