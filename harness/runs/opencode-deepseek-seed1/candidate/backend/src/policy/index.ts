export const MAX_ACTIVE_LOANS = 5;
export const LOAN_PERIOD_DAYS = 14;
export const LATE_FINE_RATE_CENTS_PER_DAY = 50;
export const LATE_FINE_CAP_CENTS = 1000;
export const RESERVATION_NOTIFICATION_HOURS = 48;
export const FINE_BORROW_BLOCK_THRESHOLD_CENTS = 500;

export function computeFineCents(
  borrowedAt: Date,
  dueAt: Date,
  returnedAt: Date,
): number {
  if (returnedAt <= dueAt) {
    return 0;
  }

  const diffMs = returnedAt.getTime() - dueAt.getTime();
  const daysLate = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (daysLate <= 0) {
    return 0;
  }

  const raw = daysLate * LATE_FINE_RATE_CENTS_PER_DAY;
  return Math.min(raw, LATE_FINE_CAP_CENTS);
}

export interface BorrowCheckInput {
  memberStatus: 'active' | 'suspended';
  activeLoanCount: number;
  unpaidFinesCents: number;
}

export interface BorrowCheckResult {
  allowed: boolean;
  reason?: string;
}

export function canBorrow(input: BorrowCheckInput): BorrowCheckResult {
  if (input.memberStatus === 'suspended') {
    return { allowed: false, reason: 'Member is suspended' };
  }

  if (input.activeLoanCount >= MAX_ACTIVE_LOANS) {
    return { allowed: false, reason: 'Loan limit reached' };
  }

  if (input.unpaidFinesCents > FINE_BORROW_BLOCK_THRESHOLD_CENTS) {
    return { allowed: false, reason: 'Outstanding fines exceed limit' };
  }

  return { allowed: true };
}

export interface ReservationEntry {
  id: string;
  book_id: string;
  member_id: string;
  queued_at: string;
  status: 'waiting' | 'notified' | 'expired' | 'fulfilled' | 'cancelled';
  notified_at: string | null;
  expires_at: string | null;
}

export function nextReservationToNotify(
  reservations: ReservationEntry[],
): ReservationEntry | null {
  const waiting = reservations
    .filter(r => r.status === 'waiting')
    .sort((a, b) => new Date(a.queued_at).getTime() - new Date(b.queued_at).getTime());

  return waiting.length > 0 ? waiting[0] : null;
}
