import Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import { ConflictError, NotFoundError } from '../errors.js';

export interface MemberRow {
  id: string;
  name: string;
  email: string;
  member_since: string;
  status: 'active' | 'suspended';
  unpaid_fines_cents: number;
  active_loans: number;
}

export const memberService = {
  list(db: Database.Database): MemberRow[] {
    const members = db.prepare(
      `SELECT m.*,
        COALESCE((SELECT SUM(f.amount_cents) FROM fines f WHERE f.member_id = m.id AND f.paid_at IS NULL), 0) as unpaid_fines_cents,
        (SELECT COUNT(*) FROM loans l WHERE l.member_id = m.id AND l.returned_at IS NULL) as active_loans
       FROM members m
       ORDER BY m.name`
    ).all() as MemberRow[];
    return members;
  },

  get(db: Database.Database, id: string): MemberRow {
    const member = db.prepare(
      `SELECT m.*,
        COALESCE((SELECT SUM(f.amount_cents) FROM fines f WHERE f.member_id = m.id AND f.paid_at IS NULL), 0) as unpaid_fines_cents,
        (SELECT COUNT(*) FROM loans l WHERE l.member_id = m.id AND l.returned_at IS NULL) as active_loans
       FROM members m
       WHERE m.id = ?`
    ).get(id) as MemberRow | undefined;

    if (!member) throw new NotFoundError('Member not found');
    return member;
  },

  create(db: Database.Database, data: { name: string; email: string }): MemberRow {
    const existing = db.prepare('SELECT id FROM members WHERE email = ?').get(data.email);
    if (existing) throw new ConflictError('Email already exists');

    const id = uuid();
    db.prepare(
      'INSERT INTO members (id, name, email, member_since, status) VALUES (?, ?, ?, ?, ?)'
    ).run(id, data.name, data.email, new Date().toISOString().slice(0, 10), 'active');

    return memberService.get(db, id);
  },

  suspend(db: Database.Database, id: string): MemberRow {
    void memberService.get(db, id);
    db.prepare("UPDATE members SET status = 'suspended' WHERE id = ?").run(id);
    return memberService.get(db, id);
  },
};