import {
  MAX_ACTIVE_LOANS,
  LOAN_PERIOD_DAYS,
  LATE_FINE_RATE_CENTS_PER_DAY,
  LATE_FINE_CAP_CENTS,
  FINE_BORROW_BLOCK_THRESHOLD_CENTS,
  RESERVATION_NOTIFICATION_HOURS,
} from './constants.js';

export interface Member {
  id: string;
  name: string;
  email: string;
  status: 'active' | 'suspended';
  member_since: string;
}

export interface Loan {
  id: string;
  book_id: string;
  member_id: string;
  borrowed_at: string;
  due_at: string;
  returned_at: string | null;
}

export interface Reservation {
  id: string;
  book_id: string;
  member_id: string;
  queued_at: string;
  status: 'waiting' | 'notified' | 'expired' | 'fulfilled' | 'cancelled';
  notified_at: string | null;
  expires_at: string | null;
}

export function computeDueAt(borrowedAt: Date): Date {
  const due = new Date(borrowedAt);
  due.setDate(due.getDate() + LOAN_PERIOD_DAYS);
  return due;
}

export function daysLate(dueAt: string | Date, returnedAt: string | Date): number {
  const due = new Date(dueAt);
  const ret = new Date(returnedAt);
  const diffMs = ret.getTime() - due.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return Math.ceil(diffDays);
}

export function computeFineCents(
  borrowedAt: string,
  dueAt: string,
  returnedAt: string
): number {
  const days = daysLate(dueAt, returnedAt);
  if (days <= 0) return 0;
  const fine = days * LATE_FINE_RATE_CENTS_PER_DAY;
  return Math.min(fine, LATE_FINE_CAP_CENTS);
}

export interface BorrowEligibility {
  canBorrow: true;
}

export interface BorrowRejection {
  canBorrow: false;
  reason: 'loan_limit' | 'suspended' | 'fines' | 'no_copies';
}

export type BorrowResult = BorrowEligibility | BorrowRejection;

export function canBorrow(
  member: Member,
  activeLoanCount: number,
  unpaidFinesCents: number
): BorrowResult {
  if (member.status === 'suspended') {
    return { canBorrow: false, reason: 'suspended' };
  }
  if (unpaidFinesCents > FINE_BORROW_BLOCK_THRESHOLD_CENTS) {
    return { canBorrow: false, reason: 'fines' };
  }
  if (activeLoanCount >= MAX_ACTIVE_LOANS) {
    return { canBorrow: false, reason: 'loan_limit' };
  }
  return { canBorrow: true };
}

export function nextReservationToNotify(
  reservations: Reservation[]
): Reservation | null {
  const waiting = reservations
    .filter((r) => r.status === 'waiting')
    .sort((a, b) => new Date(a.queued_at).getTime() - new Date(b.queued_at).getTime());
  return waiting[0] ?? null;
}

export function computeNotificationExpiry(notifiedAt: Date): Date {
  const expires = new Date(notifiedAt);
  expires.setHours(expires.getHours() + RESERVATION_NOTIFICATION_HOURS);
  return expires;
}