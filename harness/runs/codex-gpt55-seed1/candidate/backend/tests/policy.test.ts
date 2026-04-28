import { describe, expect, it } from "vitest";
import {
  FINE_BORROW_BLOCK_THRESHOLD_CENTS,
  LATE_FINE_CAP_CENTS,
  LATE_FINE_RATE_CENTS_PER_DAY,
  MAX_ACTIVE_LOANS,
  RESERVATION_NOTIFICATION_HOURS,
  addDays,
  addHours,
  canBorrow,
  computeFineCents,
  nextReservationToNotify
} from "../src/policy";

describe("policy date helpers", () => {
  it("adds loan days and reservation hours without changing the original date", () => {
    const start = new Date("2026-01-01T12:00:00.000Z");

    expect(addDays(start, 14).toISOString()).toBe("2026-01-15T12:00:00.000Z");
    expect(addHours(start, RESERVATION_NOTIFICATION_HOURS).toISOString()).toBe("2026-01-03T12:00:00.000Z");
    expect(start.toISOString()).toBe("2026-01-01T12:00:00.000Z");
  });
});

describe("policy computeFineCents", () => {
  const borrowedAt = new Date("2026-01-01T00:00:00.000Z");
  const dueAt = new Date("2026-01-15T00:00:00.000Z");

  it("returns zero at exactly the due time", () => {
    expect(computeFineCents(borrowedAt, dueAt, dueAt)).toBe(0);
  });

  it("returns zero before the due time", () => {
    expect(computeFineCents(borrowedAt, dueAt, new Date("2026-01-14T23:59:59.999Z"))).toBe(0);
  });

  it("charges one late day for any fraction after the due time", () => {
    expect(computeFineCents(borrowedAt, dueAt, new Date("2026-01-15T00:00:00.001Z"))).toBe(
      LATE_FINE_RATE_CENTS_PER_DAY
    );
  });

  it("charges 19 late days below the cap", () => {
    expect(computeFineCents(borrowedAt, dueAt, new Date("2026-02-03T00:00:00.000Z"))).toBe(950);
  });

  it("hits the cap at 20 late days", () => {
    expect(computeFineCents(borrowedAt, dueAt, new Date("2026-02-04T00:00:00.000Z"))).toBe(LATE_FINE_CAP_CENTS);
  });

  it("stays capped after 21 late days", () => {
    expect(computeFineCents(borrowedAt, dueAt, new Date("2026-02-05T00:00:00.000Z"))).toBe(LATE_FINE_CAP_CENTS);
  });
});

describe("policy canBorrow", () => {
  it("allows an active member with four active loans and fines at the threshold", () => {
    expect(canBorrow({ status: "active" }, MAX_ACTIVE_LOANS - 1, FINE_BORROW_BLOCK_THRESHOLD_CENTS)).toEqual({
      ok: true
    });
  });

  it("blocks at five active loans", () => {
    expect(canBorrow({ status: "active" }, MAX_ACTIVE_LOANS, 0)).toEqual({ ok: false, reason: "loan-limit" });
  });

  it("blocks above five active loans", () => {
    expect(canBorrow({ status: "active" }, MAX_ACTIVE_LOANS + 1, 0)).toEqual({ ok: false, reason: "loan-limit" });
  });

  it("allows fines below and at the borrow block threshold", () => {
    expect(canBorrow({ status: "active" }, 0, FINE_BORROW_BLOCK_THRESHOLD_CENTS - 1)).toEqual({ ok: true });
    expect(canBorrow({ status: "active" }, 0, FINE_BORROW_BLOCK_THRESHOLD_CENTS)).toEqual({ ok: true });
  });

  it("blocks fines over the borrow block threshold", () => {
    expect(canBorrow({ status: "active" }, 0, FINE_BORROW_BLOCK_THRESHOLD_CENTS + 1)).toEqual({
      ok: false,
      reason: "fine-limit"
    });
  });

  it("blocks suspended members", () => {
    expect(canBorrow({ status: "suspended" }, 0, 0)).toEqual({ ok: false, reason: "suspended" });
  });
});

describe("policy nextReservationToNotify", () => {
  it("selects the oldest waiting reservation and ignores notified or expired rows", () => {
    expect(
      nextReservationToNotify([
        { id: "b", queued_at: "2026-01-02T00:00:00.000Z", status: "waiting" },
        { id: "a", queued_at: "2026-01-01T00:00:00.000Z", status: "waiting" },
        { id: "c", queued_at: "2025-01-01T00:00:00.000Z", status: "notified" }
      ])
    )?.toMatchObject({ id: "a" });
  });

  it("breaks queue ties by reservation id", () => {
    expect(
      nextReservationToNotify([
        { id: "b", queued_at: "2026-01-01T00:00:00.000Z", status: "waiting" },
        { id: "a", queued_at: "2026-01-01T00:00:00.000Z", status: "waiting" }
      ])
    )?.toMatchObject({ id: "a" });
  });

  it("returns null when no waiting reservation exists", () => {
    expect(nextReservationToNotify([{ id: "x", queued_at: "2026-01-01T00:00:00.000Z", status: "expired" }])).toBeNull();
  });
});
