import type { DB } from '../db/index.js';
import { ConflictError, NotFoundError } from '../errors.js';
import type { FineRow } from '../types.js';

export function payFine(db: DB, id: string): FineRow {
  const fine = db
    .prepare('SELECT * FROM fines WHERE id = ?')
    .get(id) as FineRow | undefined;
  if (!fine) {
    throw new NotFoundError('Fine not found');
  }
  if (fine.paid_at !== null) {
    throw new ConflictError('Fine already paid');
  }
  const paidAt = new Date().toISOString();
  db.prepare('UPDATE fines SET paid_at = ? WHERE id = ?').run(paidAt, id);
  return { ...fine, paid_at: paidAt };
}

export function listFines(db: DB, memberId?: string): FineRow[] {
  if (memberId) {
    return db
      .prepare(
        'SELECT id, member_id, loan_id, amount_cents, paid_at, created_at FROM fines WHERE member_id = ? ORDER BY created_at DESC',
      )
      .all(memberId) as FineRow[];
  }
  return db
    .prepare(
      'SELECT id, member_id, loan_id, amount_cents, paid_at, created_at FROM fines ORDER BY created_at DESC',
    )
    .all() as FineRow[];
}
