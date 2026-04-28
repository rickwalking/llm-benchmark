import type Database from 'better-sqlite3';
import { ConflictError, NotFoundError } from '../errors.js';
import type { Fine } from '../types.js';

export function payFine(db: Database.Database, fineId: string): Fine {
  const fine = db.prepare('SELECT * FROM fines WHERE id = ?').get(fineId) as Fine | undefined;
  if (!fine) throw new NotFoundError('Fine not found');
  if (fine.paid_at) throw new ConflictError('Fine already paid');

  const paidAt = new Date().toISOString();
  db.prepare('UPDATE fines SET paid_at = ? WHERE id = ?').run(paidAt, fineId);

  return { ...fine, paid_at: paidAt };
}
