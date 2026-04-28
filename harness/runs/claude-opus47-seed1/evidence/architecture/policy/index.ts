export const MAX_ACTIVE_LOANS = 5;
export const LOAN_PERIOD_DAYS = 14;
export const LATE_FINE_RATE_CENTS_PER_DAY = 50;
export const LATE_FINE_CAP_CENTS = 1000;
export const RESERVATION_NOTIFICATION_HOURS = 48;
export const FINE_BORROW_BLOCK_THRESHOLD_CENTS = 500;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type MemberStatus = 'active' | 'suspended';

export interface MemberLike {
  status: MemberStatus;
}

export interface ReservationLike {
  id: string;
  status: 'waiting' | 'notified' | 'expired' | 'fulfilled' | 'cancelled';
  queued_at: string;
}

export interface BorrowDecision {
  allowed: boolean;
  reason?:
    | 'suspended'
    | 'loan_limit'
    | 'fines_exceeded';
}

export function computeFineCents(
  _borrowedAt: Date,
  dueAt: Date,
  returnedAt: Date,
): number {
  const diffMs = returnedAt.getTime() - dueAt.getTime();
  if (diffMs <= 0) {
    return 0;
  }
  const daysLate = Math.ceil(diffMs / MS_PER_DAY);
  const raw = daysLate * LATE_FINE_RATE_CENTS_PER_DAY;
  return Math.min(raw, LATE_FINE_CAP_CENTS);
}

export function canBorrow(
  member: MemberLike,
  activeLoanCount: number,
  unpaidFinesCents: number,
): BorrowDecision {
  if (member.status === 'suspended') {
    return { allowed: false, reason: 'suspended' };
  }
  if (unpaidFinesCents > FINE_BORROW_BLOCK_THRESHOLD_CENTS) {
    return { allowed: false, reason: 'fines_exceeded' };
  }
  if (activeLoanCount >= MAX_ACTIVE_LOANS) {
    return { allowed: false, reason: 'loan_limit' };
  }
  return { allowed: true };
}

export function nextReservationToNotify(
  reservations: ReservationLike[],
): ReservationLike | null {
  const waiting = reservations.filter((r) => r.status === 'waiting');
  if (waiting.length === 0) {
    return null;
  }
  let head = waiting[0];
  for (let i = 1; i < waiting.length; i += 1) {
    const candidate = waiting[i];
    if (candidate.queued_at < head.queued_at) {
      head = candidate;
    }
  }
  return head;
}

export function dueDateFromBorrow(borrowedAt: Date): Date {
  return new Date(borrowedAt.getTime() + LOAN_PERIOD_DAYS * MS_PER_DAY);
}

export function reservationExpiry(notifiedAt: Date): Date {
  return new Date(notifiedAt.getTime() + RESERVATION_NOTIFICATION_HOURS * 60 * 60 * 1000);
}
