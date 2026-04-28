/**
 * Policy module - Pure functions for all business rules
 * Centralizes business logic for testability
 */

// Business rule constants
export const MAX_ACTIVE_LOANS = 5;
export const LOAN_PERIOD_DAYS = 14;
export const LATE_FINE_RATE_CENTS_PER_DAY = 50; // $0.50
export const LATE_FINE_CAP_CENTS = 1000; // $10.00
export const RESERVATION_NOTIFICATION_HOURS = 48;
export const FINE_BORROW_BLOCK_THRESHOLD_CENTS = 500; // $5.00

/**
 * Calculate fine amount in cents for a late return
 * Formula: min(days_late × $0.50, $10.00)
 * days_late = ceil((returned_at - due_at) / 1 day)
 */
export function computeFineCents(
  _borrowedAt: Date,
  dueAt: Date,
  returnedAt: Date
): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const lateMs = returnedAt.getTime() - dueAt.getTime();
  
  if (lateMs <= 0) {
    return 0;
  }
  
  const daysLate = Math.ceil(lateMs / msPerDay);
  const fine = daysLate * LATE_FINE_RATE_CENTS_PER_DAY;
  return Math.min(fine, LATE_FINE_CAP_CENTS);
}

/**
 * Check if a member can borrow a book based on their status and fines
 */
export interface MemberStatus {
  status: 'active' | 'suspended';
  activeLoansCount: number;
  unpaidFinesCents: number;
}

export interface BorrowEligibility {
  canBorrow: boolean;
  reason?: 'suspended' | 'loan_limit' | 'outstanding_fines';
  message: string;
}

export function canBorrow(member: MemberStatus): BorrowEligibility {
  if (member.status === 'suspended') {
    return {
      canBorrow: false,
      reason: 'suspended',
      message: 'Member is suspended'
    };
  }
  
  if (member.activeLoansCount >= MAX_ACTIVE_LOANS) {
    return {
      canBorrow: false,
      reason: 'loan_limit',
      message: 'Loan limit reached'
    };
  }
  
  if (member.unpaidFinesCents > FINE_BORROW_BLOCK_THRESHOLD_CENTS) {
    return {
      canBorrow: false,
      reason: 'outstanding_fines',
      message: 'Outstanding fines exceed limit'
    };
  }
  
  return {
    canBorrow: true,
    message: 'Member can borrow'
  };
}

/**
 * Interface for reservation in queue
 */
export interface Reservation {
  id: string;
  bookId: string;
  memberId: string;
  queuedAt: Date;
  status: 'waiting' | 'notified' | 'expired' | 'fulfilled' | 'cancelled';
  notifiedAt?: Date;
  expiresAt?: Date;
}

/**
 * Find the next reservation to notify from the queue
 * Returns the oldest waiting reservation
 */
export function nextReservationToNotify(
  reservations: Reservation[]
): Reservation | null {
  const waiting = reservations
    .filter(r => r.status === 'waiting')
    .sort((a, b) => a.queuedAt.getTime() - b.queuedAt.getTime());
  
  return waiting[0] || null;
}

/**
 * Check if a reservation has expired
 */
export function isReservationExpired(reservation: Reservation, now: Date): boolean {
  if (reservation.status !== 'notified' || !reservation.expiresAt) {
    return false;
  }
  return now.getTime() > reservation.expiresAt.getTime();
}

/**
 * Calculate due date for a new loan
 */
export function calculateDueDate(borrowedAt: Date): Date {
  const due = new Date(borrowedAt);
  due.setDate(due.getDate() + LOAN_PERIOD_DAYS);
  return due;
}

/**
 * Calculate expiration date for a notified reservation
 */
export function calculateReservationExpiry(notifiedAt: Date): Date {
  const expires = new Date(notifiedAt);
  expires.setHours(expires.getHours() + RESERVATION_NOTIFICATION_HOURS);
  return expires;
}
