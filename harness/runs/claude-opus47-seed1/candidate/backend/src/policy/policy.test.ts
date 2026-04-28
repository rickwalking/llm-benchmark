import { describe, it, expect } from 'vitest';
import {
  canBorrow,
  computeFineCents,
  dueDateFromBorrow,
  FINE_BORROW_BLOCK_THRESHOLD_CENTS,
  LATE_FINE_CAP_CENTS,
  LATE_FINE_RATE_CENTS_PER_DAY,
  LOAN_PERIOD_DAYS,
  MAX_ACTIVE_LOANS,
  nextReservationToNotify,
  reservationExpiry,
  RESERVATION_NOTIFICATION_HOURS,
} from './index.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

describe('policy constants', () => {
  it('expose the documented business values', () => {
    expect(MAX_ACTIVE_LOANS).toBe(5);
    expect(LOAN_PERIOD_DAYS).toBe(14);
    expect(LATE_FINE_RATE_CENTS_PER_DAY).toBe(50);
    expect(LATE_FINE_CAP_CENTS).toBe(1000);
    expect(RESERVATION_NOTIFICATION_HOURS).toBe(48);
    expect(FINE_BORROW_BLOCK_THRESHOLD_CENTS).toBe(500);
  });
});

describe('computeFineCents', () => {
  const borrowed = new Date('2025-01-01T00:00:00.000Z');
  const due = new Date('2025-01-15T00:00:00.000Z');

  it('returns 0 when returned exactly at the due moment', () => {
    expect(computeFineCents(borrowed, due, due)).toBe(0);
  });

  it('returns 0 when returned before the due date', () => {
    expect(
      computeFineCents(borrowed, due, new Date(due.getTime() - 1)),
    ).toBe(0);
  });

  it('charges 50c for any partial day late (1ms over)', () => {
    expect(computeFineCents(borrowed, due, new Date(due.getTime() + 1))).toBe(50);
  });

  it('charges 50c at exactly 1 day late', () => {
    expect(
      computeFineCents(borrowed, due, new Date(due.getTime() + MS_PER_DAY)),
    ).toBe(50);
  });

  it('charges 100c just past 1 day late', () => {
    expect(
      computeFineCents(borrowed, due, new Date(due.getTime() + MS_PER_DAY + 1)),
    ).toBe(100);
  });

  it('charges 950c at 19 days late (cap minus one day)', () => {
    expect(
      computeFineCents(borrowed, due, new Date(due.getTime() + 19 * MS_PER_DAY)),
    ).toBe(950);
  });

  it('charges exactly the cap at 20 days late', () => {
    expect(
      computeFineCents(borrowed, due, new Date(due.getTime() + 20 * MS_PER_DAY)),
    ).toBe(1000);
  });

  it('caps at 1000c past the cap (21 days late)', () => {
    expect(
      computeFineCents(borrowed, due, new Date(due.getTime() + 21 * MS_PER_DAY)),
    ).toBe(1000);
  });

  it('caps at 1000c far past the cap (60 days late)', () => {
    expect(
      computeFineCents(borrowed, due, new Date(due.getTime() + 60 * MS_PER_DAY)),
    ).toBe(1000);
  });
});

describe('canBorrow', () => {
  const active = { status: 'active' as const };
  const suspended = { status: 'suspended' as const };

  it('allows an active member with no fines and no loans', () => {
    expect(canBorrow(active, 0, 0)).toEqual({ allowed: true });
  });

  it('blocks a suspended member regardless of other state', () => {
    expect(canBorrow(suspended, 0, 0)).toEqual({ allowed: false, reason: 'suspended' });
  });

  it('blocks a suspended member even when fines are zero and loans are at limit', () => {
    expect(canBorrow(suspended, 5, 0)).toEqual({ allowed: false, reason: 'suspended' });
  });

  it('allows borrowing at exactly 4 active loans', () => {
    expect(canBorrow(active, 4, 0)).toEqual({ allowed: true });
  });

  it('blocks borrowing at exactly 5 active loans', () => {
    expect(canBorrow(active, 5, 0)).toEqual({ allowed: false, reason: 'loan_limit' });
  });

  it('blocks borrowing above the loan limit', () => {
    expect(canBorrow(active, 6, 0)).toEqual({ allowed: false, reason: 'loan_limit' });
  });

  it('allows borrowing at $4.99 in fines', () => {
    expect(canBorrow(active, 0, 499)).toEqual({ allowed: true });
  });

  it('allows borrowing at exactly $5.00 in fines', () => {
    expect(canBorrow(active, 0, 500)).toEqual({ allowed: true });
  });

  it('blocks borrowing at $5.01 in fines', () => {
    expect(canBorrow(active, 0, 501)).toEqual({ allowed: false, reason: 'fines_exceeded' });
  });

  it('prefers the suspended reason over fines', () => {
    expect(canBorrow(suspended, 0, 5000)).toEqual({ allowed: false, reason: 'suspended' });
  });

  it('prefers the fines reason over the loan limit', () => {
    expect(canBorrow(active, 5, 600)).toEqual({ allowed: false, reason: 'fines_exceeded' });
  });
});

describe('nextReservationToNotify', () => {
  it('returns null when there are no waiting reservations', () => {
    expect(
      nextReservationToNotify([
        { id: 'a', status: 'fulfilled', queued_at: '2025-01-01T00:00:00Z' },
        { id: 'b', status: 'cancelled', queued_at: '2025-01-02T00:00:00Z' },
      ]),
    ).toBeNull();
  });

  it('returns the only waiting reservation', () => {
    const r = { id: 'only', status: 'waiting' as const, queued_at: '2025-01-01T00:00:00Z' };
    expect(nextReservationToNotify([r])).toBe(r);
  });

  it('returns the earliest queued waiting reservation', () => {
    const earliest = {
      id: 'first',
      status: 'waiting' as const,
      queued_at: '2025-01-01T00:00:00Z',
    };
    const later = {
      id: 'second',
      status: 'waiting' as const,
      queued_at: '2025-01-02T00:00:00Z',
    };
    expect(nextReservationToNotify([later, earliest])).toBe(earliest);
  });

  it('skips notified, cancelled, expired, and fulfilled reservations', () => {
    const waiting = {
      id: 'w',
      status: 'waiting' as const,
      queued_at: '2025-01-05T00:00:00Z',
    };
    expect(
      nextReservationToNotify([
        { id: 'a', status: 'notified', queued_at: '2024-01-01T00:00:00Z' },
        { id: 'b', status: 'expired', queued_at: '2024-02-01T00:00:00Z' },
        { id: 'c', status: 'cancelled', queued_at: '2024-03-01T00:00:00Z' },
        { id: 'd', status: 'fulfilled', queued_at: '2024-04-01T00:00:00Z' },
        waiting,
      ]),
    ).toBe(waiting);
  });

  it('returns null on an empty list', () => {
    expect(nextReservationToNotify([])).toBeNull();
  });
});

describe('dueDateFromBorrow', () => {
  it('adds exactly 14 days', () => {
    const borrowed = new Date('2025-06-01T12:00:00.000Z');
    const due = dueDateFromBorrow(borrowed);
    expect(due.getTime() - borrowed.getTime()).toBe(14 * MS_PER_DAY);
  });
});

describe('reservationExpiry', () => {
  it('adds exactly 48 hours', () => {
    const notified = new Date('2025-06-01T12:00:00.000Z');
    const expires = reservationExpiry(notified);
    expect(expires.getTime() - notified.getTime()).toBe(48 * 60 * 60 * 1000);
  });
});
