import Database from 'better-sqlite3';
import { ConflictError, NotFoundError } from '../errors.js';

export interface FineRow {
  id: string;
  member_id: string;
  loan_id: string;
  amount_cents: number;
  paid_at: string | null;
}

export const fineService = {
  pay(db: Database.Database, fineId: string): FineRow {
    const fine = db.prepare('SELECT * FROM fines WHERE id = ?').get(fineId) as FineRow | undefined;
    if (!fine) throw new NotFoundError('Fine not found');
    if (fine.paid_at) throw new ConflictError('Fine already paid');

    db.prepare('UPDATE fines SET paid_at = ? WHERE id = ?').run(new Date().toISOString(), fineId);
    return db.prepare('SELECT * FROM fines WHERE id = ?').get(fineId) as FineRow;
  },

  getFinesForMember(db: Database.Database, memberId: string): FineRow[] {
    return db.prepare(
      'SELECT * FROM fines WHERE member_id = ? ORDER BY id'
    ).all(memberId) as FineRow[];
  },
};