import { describe, it, expect } from 'vitest';
import { countdownTo, formatCents, formatDate, isOverdue } from './format';

describe('formatCents', () => {
  it('formats whole dollars', () => {
    expect(formatCents(0)).toBe('$0.00');
    expect(formatCents(500)).toBe('$5.00');
    expect(formatCents(1234)).toBe('$12.34');
  });
});

describe('isOverdue', () => {
  it('returns true when due date is in the past', () => {
    const past = new Date(Date.now() - 1000).toISOString();
    expect(isOverdue(past)).toBe(true);
  });
  it('returns false when due date is in the future', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(isOverdue(future)).toBe(false);
  });
});

describe('countdownTo', () => {
  it('returns "expired" if the target is past', () => {
    expect(countdownTo(new Date(Date.now() - 10_000).toISOString())).toBe('expired');
  });
  it('returns HH:MM:SS for a future time', () => {
    const now = new Date('2025-01-01T00:00:00Z');
    const future = new Date('2025-01-01T01:30:15Z').toISOString();
    expect(countdownTo(future, now)).toBe('01:30:15');
  });
});

describe('formatDate', () => {
  it('produces a non-empty string for valid ISO', () => {
    expect(formatDate('2025-06-15T00:00:00Z').length).toBeGreaterThan(0);
  });
  it('returns the input for an invalid ISO', () => {
    expect(formatDate('garbage')).toBe('garbage');
  });
});
