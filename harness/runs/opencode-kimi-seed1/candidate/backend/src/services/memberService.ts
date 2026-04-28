import type { DatabaseInstance } from '../db/database.js';
import { NotFoundError, ConflictError } from '../errors.js';

export interface Member {
  id: string;
  name: string;
  email: string;
  member_since: string;
  status: 'active' | 'suspended';
}

export interface MemberWithStats extends Member {
  active_loans: number;
  unpaid_fines_cents: number;
}

export interface CreateMemberInput {
  name: string;
  email: string;
}

export function listMembers(db: DatabaseInstance): Member[] {
  const stmt = db.prepare(`
    SELECT id, name, email, member_since, status
    FROM members
    ORDER BY LOWER(name)
  `);
  
  return stmt.all() as Member[];
}

export function getMember(db: DatabaseInstance, id: string): MemberWithStats {
  const memberStmt = db.prepare(`
    SELECT id, name, email, member_since, status
    FROM members
    WHERE id = ?
  `);
  
  const member = memberStmt.get(id) as Member | undefined;
  if (!member) {
    throw new NotFoundError('Member');
  }
  
  // Count active loans
  const loansStmt = db.prepare(`
    SELECT COUNT(*) as count
    FROM loans
    WHERE member_id = ? AND returned_at IS NULL
  `);
  const { count: activeLoans } = loansStmt.get(id) as { count: number };
  
  // Sum unpaid fines
  const finesStmt = db.prepare(`
    SELECT COALESCE(SUM(amount_cents), 0) as total
    FROM fines
    WHERE member_id = ? AND paid_at IS NULL
  `);
  const { total: unpaidFines } = finesStmt.get(id) as { total: number };
  
  return {
    ...member,
    active_loans: activeLoans,
    unpaid_fines_cents: unpaidFines
  };
}

export function createMember(db: DatabaseInstance, input: CreateMemberInput): Member {
  // Check for duplicate email
  const checkStmt = db.prepare('SELECT id FROM members WHERE email = ?');
  const existing = checkStmt.get(input.email);
  if (existing) {
    throw new ConflictError('Email already exists');
  }
  
  const id = crypto.randomUUID();
  const insertStmt = db.prepare(`
    INSERT INTO members (id, name, email, member_since, status)
    VALUES (?, ?, ?, DATE('now'), 'active')
  `);
  
  insertStmt.run(id, input.name, input.email);
  
  return {
    id,
    name: input.name,
    email: input.email,
    member_since: new Date().toISOString().split('T')[0],
    status: 'active'
  };
}
