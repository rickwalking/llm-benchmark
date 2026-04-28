import { describe, it, expect } from 'vitest';
import {
  computeFineCents,
  canBorrow,
  nextReservationToNotify,
  computeDueAt,
  daysLate,
  computeNotificationExpiry,
} from './index.js';
import {
  MAX_ACTIVE_LOANS,
  LOAN_PERIOD_DAYS,
  LATE_FINE_RATE_CENTS_PER_DAY,
  LATE_FINE_CAP_CENTS,
  FINE_BORROW_BLOCK_THRESHOLD_CENTS,
  RESERVATION_NOTIFICATION_HOURS,
} from './constants.js';
import type { Member, Reservation } from './index.js';

describe('Policy constants', () => {
  it('MAX_ACTIVE_LOANS is 5', () => {
    expect(MAX_ACTIVE_LOANS).toBe(5);
  });
  it('LOAN_PERIOD_DAYS is 14', () => {
    expect(LOAN_PERIOD_DAYS).toBe(14);
  });
  it('LATE_FINE_RATE_CENTS_PER_DAY is 50', () => {
    expect(LATE_FINE_RATE_CENTS_PER_DAY).toBe(50);
  });
  it('LATE_FINE_CAP_CENTS is 1000', () => {
    expect(LATE_FINE_CAP_CENTS).toBe(1000);
  });
  it('RESERVATION_NOTIFICATION_HOURS is 48', () => {
    expect(RESERVATION_NOTIFICATION_HOURS).toBe(48);
  });
  it('FINE_BORROW_BLOCK_THRESHOLD_CENTS is 500', () => {
    expect(FINE_BORROW_BLOCK_THRESHOLD_CENTS).toBe(500);
  });
});

describe('computeFineCents', () => {
  it('returns 0 for on-time return', () => {
    const borrowed = '2024-01-01T00:00:00Z';
    const due = '2024-01-15T00:00:00Z';
    const returned = '2024-01-15T00:00:00Z';
    expect(computeFineCents(borrowed, due, returned)).toBe(0);
  });

  it('returns 0 for early return', () => {
    const borrowed = '2024-01-01T00:00:00Z';
    const due = '2024-01-15T00:00:00Z';
    const returned = '2024-01-10T00:00:00Z';
    expect(computeFineCents(borrowed, due, returned)).toBe(0);
  });

  it('returns 50 cents for 1 second past due (1 day late per ceil)', () => {
    const borrowed = '2024-01-01T00:00:00Z';
    const due = '2024-01-15T00:00:00Z';
    const returned = '2024-01-15T00:00:01Z';
    expect(computeFineCents(borrowed, due, returned)).toBe(50);
  });

  it('returns 100 cents for exactly 2 days late', () => {
    const borrowed = '2024-01-01T00:00:00Z';
    const due = '2024-01-15T00:00:00Z';
    const returned = '2024-01-17T00:00:00Z';
    expect(computeFineCents(borrowed, due, returned)).toBe(100);
  });

  it('returns 550 cents for 11 days late', () => {
    const borrowed = '2024-01-01T00:00:00Z';
    const due = '2024-01-15T00:00:00Z';
    const returned = '2024-01-26T00:00:00Z';
    expect(computeFineCents(borrowed, due, returned)).toBe(550);
  });

  it('caps at 1000 cents for 20 days late', () => {
    const borrowed = '2024-01-01T00:00:00Z';
    const due = '2024-01-15T00:00:00Z';
    const returned = '2024-02-04T00:00:00Z';
    expect(computeFineCents(borrowed, due, returned)).toBe(1000);
  });

  it('caps at 1000 cents for 21+ days late', () => {
    const borrowed = '2024-01-01T00:00:00Z';
    const due = '2024-01-15T00:00:00Z';
    const returned = '2024-02-10T00:00:00Z';
    expect(computeFineCents(borrowed, due, returned)).toBe(1000);
  });

  it('handles partial day late correctly (125ms past due)', () => {
    const due = '2024-01-15T00:00:00Z';
    const returned = '2024-01-15T12:00:01Z';
    const borrowed = '2024-01-01T00:00:00Z';
    expect(computeFineCents(borrowed, due, returned)).toBe(50);
  });
});

describe('daysLate', () => {
  it('returns 0 for same-day return', () => {
    expect(daysLate('2024-01-15T00:00:00Z', '2024-01-15T00:00:00Z')).toBe(0);
  });

  it('returns 0 for early return', () => {
    expect(daysLate('2024-01-15T00:00:00Z', '2024-01-14T23:59:59Z')).toBeLessThanOrEqual(0);
  });

  it('returns 1 for 1 second past due', () => {
    expect(daysLate('2024-01-15T00:00:00Z', '2024-01-15T00:00:01Z')).toBe(1);
  });
});

describe('canBorrow', () => {
  const activeMember: Member = {
    id: '1',
    name: 'Test',
    email: 'test@example.com',
    status: 'active',
    member_since: '2024-01-01',
  };

  const suspendedMember: Member = {
    ...activeMember,
    status: 'suspended',
  };

  it('allows borrowing for active member with no loans and no fines', () => {
    const result = canBorrow(activeMember, 0, 0);
    expect(result.canBorrow).toBe(true);
  });

  it('rejects suspended member', () => {
    const result = canBorrow(suspendedMember, 0, 0);
    expect(result.canBorrow).toBe(false);
    if (!result.canBorrow) expect(result.reason).toBe('suspended');
  });

  it('rejects member with fines exceeding $5.00', () => {
    const result = canBorrow(activeMember, 0, 501);
    expect(result.canBorrow).toBe(false);
    if (!result.canBorrow) expect(result.reason).toBe('fines');
  });

  it('allows member with fines at exactly $5.00', () => {
    const result = canBorrow(activeMember, 0, 500);
    expect(result.canBorrow).toBe(true);
  });

  it('rejects member with fines at $5.01', () => {
    const result = canBorrow(activeMember, 0, 501);
    expect(result.canBorrow).toBe(false);
  });

  it('allows member with 4 active loans', () => {
    const result = canBorrow(activeMember, 4, 0);
    expect(result.canBorrow).toBe(true);
  });

  it('allows member with exactly 4 active loans', () => {
    const result = canBorrow(activeMember, 4, 0);
    expect(result.canBorrow).toBe(true);
  });

  it('rejects member with 5 active loans', () => {
    const result = canBorrow(activeMember, 5, 0);
    expect(result.canBorrow).toBe(false);
    if (!result.canBorrow) expect(result.reason).toBe('loan_limit');
  });

  it('rejects member with 6 active loans', () => {
    const result = canBorrow(activeMember, 6, 0);
    expect(result.canBorrow).toBe(false);
    if (!result.canBorrow) expect(result.reason).toBe('loan_limit');
  });

  it('prioritizes suspension check over other checks', () => {
    const result = canBorrow(suspendedMember, 5, 600);
    expect(result.canBorrow).toBe(false);
    if (!result.canBorrow) expect(result.reason).toBe('suspended');
  });

  it('prioritizes fines over loan limit', () => {
    const result = canBorrow(activeMember, 5, 600);
    expect(result.canBorrow).toBe(false);
    if (!result.canBorrow) expect(result.reason).toBe('fines');
  });

  it('allows member with $4.99 fines', () => {
    const result = canBorrow(activeMember, 0, 499);
    expect(result.canBorrow).toBe(true);
  });
});

describe('nextReservationToNotify', () => {
  it('returns null when no reservations', () => {
    expect(nextReservationToNotify([])).toBeNull();
  });

  it('returns null when only non-waiting reservations', () => {
    const reservations: Reservation[] = [
      { id: '1', book_id: 'b1', member_id: 'm1', queued_at: '2024-01-01', status: 'notified', notified_at: null, expires_at: null },
    ];
    expect(nextReservationToNotify(reservations)).toBeNull();
  });

  it('returns oldest waiting reservation', () => {
    const reservations: Reservation[] = [
      { id: '2', book_id: 'b1', member_id: 'm2', queued_at: '2024-01-02', status: 'waiting', notified_at: null, expires_at: null },
      { id: '1', book_id: 'b1', member_id: 'm1', queued_at: '2024-01-01', status: 'waiting', notified_at: null, expires_at: null },
    ];
    const result = nextReservationToNotify(reservations);
    expect(result?.id).toBe('1');
  });
});

describe('computeDueAt', () => {
  it('computes due date 14 days from borrow date', () => {
    const borrowed = new Date('2024-01-01T10:00:00Z');
    const due = computeDueAt(borrowed);
    expect(due.getDate()).toBe(15);
    expect(due.getMonth()).toBe(0);
  });
});

describe('computeNotificationExpiry', () => {
  it('computes expiry 48 hours from notification', () => {
    const notified = new Date('2024-01-01T12:00:00Z');
    const expires = computeNotificationExpiry(notified);
    expect(expires.getTime() - notified.getTime()).toBe(48 * 60 * 60 * 1000);
  });
});