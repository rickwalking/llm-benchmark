import { randomUUID } from "node:crypto";

import { ConflictError, ForbiddenError, NotFoundError, PaymentRequiredError } from "../errors";
import { LOAN_PERIOD_DAYS, addDays, canBorrow, computeFineCents, nextReservationToNotify } from "../policy";
import type { Db } from "./dbTypes";
import type { FineRow, LoanRow, ReservationRow } from "./types";
import { getBookStats, getLoanCount, getMemberRow, getReservationsForBook, getUnpaidFinesCents } from "./serviceHelpers";
import { notifyReservation } from "./reservationService";

export type ReturnResult = {
  loan: LoanRow;
  fine: FineRow | null;
  notified_reservation: ReservationRow | null;
};

export function borrowBook(db: Db, input: { member_id: string; book_id: string }, now = new Date()): LoanRow {
  return db.transaction(() => {
    const member = getMemberRow(db, input.member_id);
    const book = getBookStats(db, input.book_id);
    const decision = canBorrow(member, getLoanCount(db, input.member_id), getUnpaidFinesCents(db, input.member_id));
    if (!decision.ok) {
      if (decision.reason === "suspended") {
        throw new ForbiddenError("Member is suspended");
      }
      if (decision.reason === "fine-limit") {
        throw new PaymentRequiredError("Outstanding fines exceed limit");
      }
      throw new ConflictError("Loan limit reached");
    }
    const notifiedReservations = getReservationsForBook(db, input.book_id, "notified");
    const memberNotification = notifiedReservations.find((reservation) => reservation.member_id === input.member_id);
    if (notifiedReservations.length > 0 && !memberNotification) {
      throw new ConflictError("Book is reserved for another member");
    }
    if (book.available_copies <= 0 && !memberNotification) {
      throw new ConflictError("No copies available — reserve instead");
    }
    const borrowedAt = now.toISOString();
    const dueAt = addDays(now, LOAN_PERIOD_DAYS).toISOString();
    const id = randomUUID();
    db.prepare(
      "INSERT INTO loans (id, book_id, member_id, borrowed_at, due_at, returned_at) VALUES (?, ?, ?, ?, ?, NULL)"
    ).run(id, input.book_id, input.member_id, borrowedAt, dueAt);
    if (memberNotification) {
      db.prepare("UPDATE reservations SET status = 'fulfilled' WHERE id = ?").run(memberNotification.id);
    }
    return getLoan(db, id);
  })();
}

export function returnLoan(db: Db, loanId: string, now = new Date()): ReturnResult {
  return db.transaction(() => {
    const loan = getLoan(db, loanId);
    if (loan.returned_at) {
      throw new ConflictError("Loan already returned");
    }
    const returnedAt = now.toISOString();
    db.prepare("UPDATE loans SET returned_at = ? WHERE id = ?").run(returnedAt, loanId);
    const fineCents = computeFineCents(new Date(loan.borrowed_at), new Date(loan.due_at), now);
    const fine =
      fineCents > 0
        ? createFine(db, { memberId: loan.member_id, loanId, amountCents: fineCents })
        : null;
    const next = nextReservationToNotify(getReservationsForBook(db, loan.book_id, "waiting"));
    const notified = next ? notifyReservation(db, next.id, now) : null;
    return { loan: getLoan(db, loanId), fine, notified_reservation: notified };
  })();
}

export function getLoan(db: Db, loanId: string): LoanRow {
  const loan = db
    .prepare("SELECT id, book_id, member_id, borrowed_at, due_at, returned_at FROM loans WHERE id = ?")
    .get(loanId) as LoanRow | undefined;
  if (!loan) {
    throw new NotFoundError("Loan not found");
  }
  return loan;
}

function createFine(
  db: Db,
  input: { memberId: string; loanId: string; amountCents: number }
): FineRow {
  const id = randomUUID();
  db.prepare(
    "INSERT INTO fines (id, member_id, loan_id, amount_cents, paid_at) VALUES (?, ?, ?, ?, NULL)"
  ).run(id, input.memberId, input.loanId, input.amountCents);
  return db
    .prepare("SELECT id, member_id, loan_id, amount_cents, paid_at FROM fines WHERE id = ?")
    .get(id) as FineRow;
}
