import { ConflictError, NotFoundError } from "../errors";
import type { Db } from "./dbTypes";
import type { FineRow } from "./types";

export function payFine(db: Db, fineId: string, now = new Date()): FineRow {
  const fine = getFine(db, fineId);
  if (fine.paid_at) {
    throw new ConflictError("Fine already paid");
  }
  db.prepare("UPDATE fines SET paid_at = ? WHERE id = ?").run(now.toISOString(), fineId);
  return getFine(db, fineId);
}

export function getFine(db: Db, fineId: string): FineRow {
  const fine = db
    .prepare("SELECT id, member_id, loan_id, amount_cents, paid_at FROM fines WHERE id = ?")
    .get(fineId) as FineRow | undefined;
  if (!fine) {
    throw new NotFoundError("Fine not found");
  }
  return fine;
}
