export const MAX_ACTIVE_LOANS = 5;
export const LOAN_PERIOD_DAYS = 14;
export const LATE_FINE_RATE_CENTS_PER_DAY = 50;
export const LATE_FINE_CAP_CENTS = 1000;
export const RESERVATION_NOTIFICATION_HOURS = 48;
export const FINE_BORROW_BLOCK_THRESHOLD_CENTS = 500;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type BorrowMember = {
  status: "active" | "suspended";
};

export type BorrowDecision =
  | { ok: true }
  | { ok: false; reason: "suspended" | "loan-limit" | "fine-limit" };

export type ReservationCandidate = {
  id: string;
  queued_at: string;
  status: "waiting" | "notified" | "expired" | "fulfilled" | "cancelled";
};

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

export function computeFineCents(_borrowedAt: Date, dueAt: Date, returnedAt: Date): number {
  const daysLate = Math.ceil((returnedAt.getTime() - dueAt.getTime()) / MS_PER_DAY);
  if (daysLate <= 0) {
    return 0;
  }
  return Math.min(daysLate * LATE_FINE_RATE_CENTS_PER_DAY, LATE_FINE_CAP_CENTS);
}

export function canBorrow(
  member: BorrowMember,
  activeLoans: number,
  unpaidFinesCents: number
): BorrowDecision {
  if (member.status === "suspended") {
    return { ok: false, reason: "suspended" };
  }
  if (activeLoans >= MAX_ACTIVE_LOANS) {
    return { ok: false, reason: "loan-limit" };
  }
  if (unpaidFinesCents > FINE_BORROW_BLOCK_THRESHOLD_CENTS) {
    return { ok: false, reason: "fine-limit" };
  }
  return { ok: true };
}

export function nextReservationToNotify<T extends ReservationCandidate>(reservations: T[]): T | null {
  const waiting = reservations
    .filter((reservation) => reservation.status === "waiting")
    .sort((left, right) => {
      const byDate = new Date(left.queued_at).getTime() - new Date(right.queued_at).getTime();
      return byDate === 0 ? left.id.localeCompare(right.id) : byDate;
    });
  return waiting[0] ?? null;
}
