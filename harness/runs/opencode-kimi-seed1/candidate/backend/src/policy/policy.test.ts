import { describe, it, expect } from 'vitest';
import {
  MAX_ACTIVE_LOANS,
  LOAN_PERIOD_DAYS,
  LATE_FINE_RATE_CENTS_PER_DAY,
  LATE_FINE_CAP_CENTS,
  RESERVATION_NOTIFICATION_HOURS,
  FINE_BORROW_BLOCK_THRESHOLD_CENTS,
  computeFineCents,
  canBorrow,
  calculateDueDate,
  calculateReservationExpiry,
  nextReservationToNotify,
  isReservationExpired
} from '../policy/index.js';

describe('Policy Constants', () => {
  it('has correct MAX_ACTIVE_LOANS', () => {
    expect(MAX_ACTIVE_LOANS).toBe(5);
  });

  it('has correct LOAN_PERIOD_DAYS', () => {
    expect(LOAN_PERIOD_DAYS).toBe(14);
  });

  it('has correct LATE_FINE_RATE_CENTS_PER_DAY', () => {
    expect(LATE_FINE_RATE_CENTS_PER_DAY).toBe(50);
  });

  it('has correct LATE_FINE_CAP_CENTS', () => {
    expect(LATE_FINE_CAP_CENTS).toBe(1000);
  });

  it('has correct RESERVATION_NOTIFICATION_HOURS', () => {
    expect(RESERVATION_NOTIFICATION_HOURS).toBe(48);
  });

  it('has correct FINE_BORROW_BLOCK_THRESHOLD_CENTS', () => {
    expect(FINE_BORROW_BLOCK_THRESHOLD_CENTS).toBe(500);
  });
});

describe('computeFineCents', () => {
  it('returns 0 when returned on time', () => {
    const borrowed = new Date('2024-01-01');
    const due = new Date('2024-01-15');
    const returned = new Date('2024-01-14');
    expect(computeFineCents(borrowed, due, returned)).toBe(0);
  });

  it('returns 0 when returned exactly at due date', () => {
    const borrowed = new Date('2024-01-01');
    const due = new Date('2024-01-15');
    const returned = new Date('2024-01-15');
    expect(computeFineCents(borrowed, due, returned)).toBe(0);
  });

  it('calculates $0.50 for 1 day late', () => {
    const borrowed = new Date('2024-01-01');
    const due = new Date('2024-01-15');
    const returned = new Date('2024-01-16');
    expect(computeFineCents(borrowed, due, returned)).toBe(50);
  });

  it('calculates $9.50 for 19 days late (cap-1)', () => {
    const borrowed = new Date('2024-01-01');
    const due = new Date('2024-01-15');
    const returned = new Date('2024-02-03'); // 19 days late
    expect(computeFineCents(borrowed, due, returned)).toBe(950);
  });

  it('caps at $10.00 for 20 days late', () => {
    const borrowed = new Date('2024-01-01');
    const due = new Date('2024-01-15');
    const returned = new Date('2024-02-04'); // 20 days late
    expect(computeFineCents(borrowed, due, returned)).toBe(1000);
  });

  it('caps at $10.00 for 21 days late (over cap)', () => {
    const borrowed = new Date('2024-01-01');
    const due = new Date('2024-01-15');
    const returned = new Date('2024-02-05'); // 21 days late
    expect(computeFineCents(borrowed, due, returned)).toBe(1000);
  });
});

describe('canBorrow', () => {
  it('allows borrowing for active member with no loans and no fines', () => {
    const member = { status: 'active' as const, activeLoansCount: 0, unpaidFinesCents: 0 };
    const result = canBorrow(member);
    expect(result.canBorrow).toBe(true);
  });

  it('allows borrowing at exactly $5.00 fines', () => {
    const member = { status: 'active' as const, activeLoansCount: 0, unpaidFinesCents: 500 };
    const result = canBorrow(member);
    expect(result.canBorrow).toBe(true);
  });

  it('blocks borrowing for suspended member', () => {
    const member = { status: 'suspended' as const, activeLoansCount: 0, unpaidFinesCents: 0 };
    const result = canBorrow(member);
    expect(result.canBorrow).toBe(false);
    expect(result.reason).toBe('suspended');
  });

  it('blocks borrowing at loan limit (5)', () => {
    const member = { status: 'active' as const, activeLoansCount: 5, unpaidFinesCents: 0 };
    const result = canBorrow(member);
    expect(result.canBorrow).toBe(false);
    expect(result.reason).toBe('loan_limit');
  });

  it('blocks borrowing when fines exceed $5.00', () => {
    const member = { status: 'active' as const, activeLoansCount: 0, unpaidFinesCents: 501 };
    const result = canBorrow(member);
    expect(result.canBorrow).toBe(false);
    expect(result.reason).toBe('outstanding_fines');
  });

  it('allows borrowing at 4 active loans', () => {
    const member = { status: 'active' as const, activeLoansCount: 4, unpaidFinesCents: 0 };
    const result = canBorrow(member);
    expect(result.canBorrow).toBe(true);
  });

  it('blocks borrowing at 6 active loans', () => {
    const member = { status: 'active' as const, activeLoansCount: 6, unpaidFinesCents: 0 };
    const result = canBorrow(member);
    expect(result.canBorrow).toBe(false);
    expect(result.reason).toBe('loan_limit');
  });
});

describe('calculateDueDate', () => {
  it('adds 14 days to borrowed date', () => {
    const borrowed = new Date(2024, 0, 1); // January 1, 2024 (local time)
    const due = calculateDueDate(borrowed);
    expect(due.getDate()).toBe(15);
    expect(due.getMonth()).toBe(0); // January
  });
});

describe('calculateReservationExpiry', () => {
  it('adds 48 hours to notified time', () => {
    const notified = new Date('2024-01-01T12:00:00');
    const expires = calculateReservationExpiry(notified);
    expect(expires.getDate()).toBe(3);
    expect(expires.getHours()).toBe(12);
  });
});

describe('nextReservationToNotify', () => {
  it('returns null when no waiting reservations', () => {
    const reservations = [
      { id: '1', bookId: 'b1', memberId: 'm1', queuedAt: new Date(), status: 'fulfilled' as const, notifiedAt: undefined, expiresAt: undefined }
    ];
    expect(nextReservationToNotify(reservations)).toBeNull();
  });

  it('returns the oldest waiting reservation', () => {
    const reservations = [
      { id: '2', bookId: 'b1', memberId: 'm2', queuedAt: new Date('2024-01-02'), status: 'waiting' as const, notifiedAt: undefined, expiresAt: undefined },
      { id: '1', bookId: 'b1', memberId: 'm1', queuedAt: new Date('2024-01-01'), status: 'waiting' as const, notifiedAt: undefined, expiresAt: undefined }
    ];
    const next = nextReservationToNotify(reservations);
    expect(next?.id).toBe('1');
  });
});

describe('isReservationExpired', () => {
  it('returns false for non-notified reservation', () => {
    const reservation = {
      id: '1',
      bookId: 'b1',
      memberId: 'm1',
      queuedAt: new Date(),
      status: 'waiting' as const,
      notifiedAt: undefined,
      expiresAt: undefined
    };
    expect(isReservationExpired(reservation, new Date())).toBe(false);
  });

  it('returns true when past expiry', () => {
    const reservation = {
      id: '1',
      bookId: 'b1',
      memberId: 'm1',
      queuedAt: new Date(),
      status: 'notified' as const,
      notifiedAt: new Date('2024-01-01'),
      expiresAt: new Date('2024-01-03')
    };
    expect(isReservationExpired(reservation, new Date('2024-01-04'))).toBe(true);
  });

  it('returns false when before expiry', () => {
    const reservation = {
      id: '1',
      bookId: 'b1',
      memberId: 'm1',
      queuedAt: new Date(),
      status: 'notified' as const,
      notifiedAt: new Date('2024-01-01'),
      expiresAt: new Date('2024-01-03')
    };
    expect(isReservationExpired(reservation, new Date('2024-01-02'))).toBe(false);
  });
});
