import { describe, it, expect } from 'vitest';
import type { ReservationEntry } from './index.js';
import {
  MAX_ACTIVE_LOANS,
  LOAN_PERIOD_DAYS,
  LATE_FINE_RATE_CENTS_PER_DAY,
  LATE_FINE_CAP_CENTS,
  RESERVATION_NOTIFICATION_HOURS,
  FINE_BORROW_BLOCK_THRESHOLD_CENTS,
  computeFineCents,
  canBorrow,
  nextReservationToNotify,
} from './index.js';

describe('computeFineCents', () => {
  const baseDate = new Date('2025-01-01T12:00:00Z');

  it('returns 0 for on-time return', () => {
    const borrowedAt = baseDate;
    const dueAt = new Date(baseDate.getTime() + 14 * 24 * 60 * 60 * 1000);
    const returnedAt = dueAt;
    expect(computeFineCents(borrowedAt, dueAt, returnedAt)).toBe(0);
  });

  it('returns 0 for early return', () => {
    const borrowedAt = baseDate;
    const dueAt = new Date(baseDate.getTime() + 14 * 24 * 60 * 60 * 1000);
    const returnedAt = new Date(dueAt.getTime() - 2 * 24 * 60 * 60 * 1000);
    expect(computeFineCents(borrowedAt, dueAt, returnedAt)).toBe(0);
  });

  it('returns 0 for exactly 0 days late', () => {
    const borrowedAt = baseDate;
    const dueAt = new Date(baseDate.getTime() + 14 * 24 * 60 * 60 * 1000);
    const returnedAt = new Date(dueAt.getTime() - 1); // 1ms before due
    expect(computeFineCents(borrowedAt, dueAt, returnedAt)).toBe(0);
  });

  it('returns 50 cents for 1 day late', () => {
    const borrowedAt = baseDate;
    const dueAt = new Date(baseDate.getTime() + 14 * 24 * 60 * 60 * 1000);
    const returnedAt = new Date(dueAt.getTime() + 1 * 24 * 60 * 60 * 1000);
    expect(computeFineCents(borrowedAt, dueAt, returnedAt)).toBe(50);
  });

  it('returns 100 cents for 2 days late', () => {
    const borrowedAt = baseDate;
    const dueAt = new Date(baseDate.getTime() + 14 * 24 * 60 * 60 * 1000);
    const returnedAt = new Date(dueAt.getTime() + 2 * 24 * 60 * 60 * 1000);
    expect(computeFineCents(borrowedAt, dueAt, returnedAt)).toBe(100);
  });

  it('ceil: 1 hour late counts as 1 day', () => {
    const borrowedAt = baseDate;
    const dueAt = new Date(baseDate.getTime() + 14 * 24 * 60 * 60 * 1000);
    const returnedAt = new Date(dueAt.getTime() + 1 * 60 * 60 * 1000 + 1);
    expect(computeFineCents(borrowedAt, dueAt, returnedAt)).toBe(50);
  });

  it('returns 950 cents for 19 days late (cap - 1 day)', () => {
    const borrowedAt = baseDate;
    const dueAt = new Date(baseDate.getTime() + 14 * 24 * 60 * 60 * 1000);
    const returnedAt = new Date(dueAt.getTime() + 19 * 24 * 60 * 60 * 1000);
    expect(computeFineCents(borrowedAt, dueAt, returnedAt)).toBe(950);
  });

  it('caps at 1000 cents for exactly 20 days late', () => {
    const borrowedAt = baseDate;
    const dueAt = new Date(baseDate.getTime() + 14 * 24 * 60 * 60 * 1000);
    const returnedAt = new Date(dueAt.getTime() + 20 * 24 * 60 * 60 * 1000);
    expect(computeFineCents(borrowedAt, dueAt, returnedAt)).toBe(1000);
  });

  it('caps at 1000 cents for 21 days late (over cap)', () => {
    const borrowedAt = baseDate;
    const dueAt = new Date(baseDate.getTime() + 14 * 24 * 60 * 60 * 1000);
    const returnedAt = new Date(dueAt.getTime() + 21 * 24 * 60 * 60 * 1000);
    expect(computeFineCents(borrowedAt, dueAt, returnedAt)).toBe(1000);
  });

  it('caps at 1000 cents for 100 days late', () => {
    const borrowedAt = baseDate;
    const dueAt = new Date(baseDate.getTime() + 14 * 24 * 60 * 60 * 1000);
    const returnedAt = new Date(dueAt.getTime() + 100 * 24 * 60 * 60 * 1000);
    expect(computeFineCents(borrowedAt, dueAt, returnedAt)).toBe(1000);
  });
});

describe('canBorrow', () => {
  it('allows borrow with 0 active loans and no fines', () => {
    expect(canBorrow({ memberStatus: 'active', activeLoanCount: 0, unpaidFinesCents: 0 }))
      .toEqual({ allowed: true });
  });

  it('allows borrow with 4 active loans', () => {
    expect(canBorrow({ memberStatus: 'active', activeLoanCount: 4, unpaidFinesCents: 0 }))
      .toEqual({ allowed: true });
  });

  it('allows borrow with exactly 5 active loans (at limit)', () => {
    expect(canBorrow({ memberStatus: 'active', activeLoanCount: 5, unpaidFinesCents: 0 }))
      .toEqual({ allowed: false, reason: 'Loan limit reached' });
  });

  it('rejects with 6 active loans', () => {
    expect(canBorrow({ memberStatus: 'active', activeLoanCount: 6, unpaidFinesCents: 0 }))
      .toEqual({ allowed: false, reason: 'Loan limit reached' });
  });

  it('rejects suspended member', () => {
    expect(canBorrow({ memberStatus: 'suspended', activeLoanCount: 0, unpaidFinesCents: 0 }))
      .toEqual({ allowed: false, reason: 'Member is suspended' });
  });

  it('rejects suspended member even with 0 loans', () => {
    expect(canBorrow({ memberStatus: 'suspended', activeLoanCount: 0, unpaidFinesCents: 0 }))
      .toEqual({ allowed: false, reason: 'Member is suspended' });
  });

  it('allows borrow with $4.99 in unpaid fines', () => {
    expect(canBorrow({ memberStatus: 'active', activeLoanCount: 0, unpaidFinesCents: 499 }))
      .toEqual({ allowed: true });
  });

  it('allows borrow with exactly $5.00 in unpaid fines (at threshold)', () => {
    expect(canBorrow({ memberStatus: 'active', activeLoanCount: 0, unpaidFinesCents: 500 }))
      .toEqual({ allowed: true });
  });

  it('rejects borrow with $5.01 in unpaid fines (over threshold)', () => {
    expect(canBorrow({ memberStatus: 'active', activeLoanCount: 0, unpaidFinesCents: 501 }))
      .toEqual({ allowed: false, reason: 'Outstanding fines exceed limit' });
  });

  it('rejects with $10.00 in unpaid fines', () => {
    expect(canBorrow({ memberStatus: 'active', activeLoanCount: 0, unpaidFinesCents: 1000 }))
      .toEqual({ allowed: false, reason: 'Outstanding fines exceed limit' });
  });

  it('rejects suspended takes priority over loan limit', () => {
    expect(canBorrow({ memberStatus: 'suspended', activeLoanCount: 6, unpaidFinesCents: 0 }))
      .toEqual({ allowed: false, reason: 'Member is suspended' });
  });
});

describe('nextReservationToNotify', () => {
  it('returns null for empty list', () => {
    expect(nextReservationToNotify([])).toBeNull();
  });

  it('returns null when no waiting reservations', () => {
    expect(nextReservationToNotify([
      { id: '1', book_id: 'b1', member_id: 'm1', queued_at: '2025-01-01T00:00:00Z', status: 'notified' as ReservationEntry['status'], notified_at: null, expires_at: null },
    ])).toBeNull();
  });

  it('returns the oldest waiting reservation', () => {
    const reservations: ReservationEntry[] = [
      { id: '2', book_id: 'b1', member_id: 'm2', queued_at: '2025-01-02T00:00:00Z', status: 'waiting', notified_at: null, expires_at: null },
      { id: '1', book_id: 'b1', member_id: 'm1', queued_at: '2025-01-01T00:00:00Z', status: 'waiting', notified_at: null, expires_at: null },
    ];
    const result = nextReservationToNotify(reservations);
    expect(result?.id).toBe('1');
  });

  it('ignores non-waiting statuses', () => {
    const reservations: ReservationEntry[] = [
      { id: '1', book_id: 'b1', member_id: 'm1', queued_at: '2025-01-01T00:00:00Z', status: 'fulfilled', notified_at: null, expires_at: null },
      { id: '2', book_id: 'b1', member_id: 'm2', queued_at: '2025-01-02T00:00:00Z', status: 'waiting', notified_at: null, expires_at: null },
    ];
    const result = nextReservationToNotify(reservations);
    expect(result?.id).toBe('2');
  });
});

describe('constants', () => {
  it('are not mutated', () => {
    expect(MAX_ACTIVE_LOANS).toBe(5);
    expect(LOAN_PERIOD_DAYS).toBe(14);
    expect(LATE_FINE_RATE_CENTS_PER_DAY).toBe(50);
    expect(LATE_FINE_CAP_CENTS).toBe(1000);
    expect(RESERVATION_NOTIFICATION_HOURS).toBe(48);
    expect(FINE_BORROW_BLOCK_THRESHOLD_CENTS).toBe(500);
  });
});
