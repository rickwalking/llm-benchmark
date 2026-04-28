import { describe, expect, it } from "vitest";
import { borrow, createBook, createMember, makeTestStack, reserve } from "./testUtils";
import { cancelReservation, getReservation, notifyWaitingReservationsForAvailableCopies } from "../src/services/reservationService";

describe("reservation API", () => {
  it("AC-5.1: creates a waiting reservation", async () => {
    const { agent } = makeTestStack();
    const response = await agent
      .post("/api/reservations")
      .send({ member_id: (await createMember(agent, "Alice")).id, book_id: (await createBook(agent, "Queue Book")).id })
      .expect(201);

    expect(response.body.status).toBe("waiting");
    expect(response.body.queued_at).toBeTruthy();
  });

  it("AC-5.2: rejects reservations when the member already has the book on loan", async () => {
    const { agent } = makeTestStack();
    const member = await createMember(agent, "Alice");
    const book = await createBook(agent, "Loaned Book");
    await borrow(agent, member, book);

    const response = await agent.post("/api/reservations").send({ member_id: member.id, book_id: book.id }).expect(409);

    expect(response.body).toEqual({ error: "Member already has this book on loan" });
  });

  it("AC-5.3: rejects duplicate active reservations", async () => {
    const { agent } = makeTestStack();
    const member = await createMember(agent, "Alice");
    const book = await createBook(agent, "Duplicate Reservation");
    await reserve(agent, member, book);

    const response = await agent.post("/api/reservations").send({ member_id: member.id, book_id: book.id }).expect(409);

    expect(response.body).toEqual({ error: "Duplicate reservation" });
  });

  it("AC-5.4: lets the notified member borrow and fulfills their reservation", async () => {
    const { db, agent } = makeTestStack();
    const book = await createBook(agent, "Notification Book");
    const borrower = await createMember(agent, "Borrower");
    const waiter = await createMember(agent, "Waiter");
    const other = await createMember(agent, "Other");
    const loan = await borrow(agent, borrower, book);
    const reservation = await reserve(agent, waiter, book);
    await agent.post(`/api/loans/${loan.id}/return`).expect(200);

    const blocked = await agent.post("/api/loans").send({ member_id: other.id, book_id: book.id }).expect(409);
    await agent.post("/api/loans").send({ member_id: waiter.id, book_id: book.id }).expect(201);
    const status = db.prepare("SELECT status FROM reservations WHERE id = ?").get(reservation.id) as { status: string };

    expect(blocked.body).toEqual({ error: "Book is reserved for another member" });
    expect(status.status).toBe("fulfilled");
  });

  it("AC-5.5: expires stale notifications and notifies the next waiting reservation", async () => {
    const { db, agent } = makeTestStack();
    const book = await createBook(agent, "Expiring Book");
    const borrower = await createMember(agent, "Borrower");
    const first = await createMember(agent, "First");
    const second = await createMember(agent, "Second");
    const loan = await borrow(agent, borrower, book);
    const firstReservation = await reserve(agent, first, book);
    const secondReservation = await reserve(agent, second, book);
    await agent.post(`/api/loans/${loan.id}/return`).expect(200);
    db.prepare("UPDATE reservations SET expires_at = ? WHERE id = ?").run("2000-01-01T00:00:00.000Z", firstReservation.id);

    const response = await agent.post("/api/reservations/expire").expect(200);
    const rows = db
      .prepare("SELECT id, status FROM reservations WHERE id IN (?, ?) ORDER BY id")
      .all(firstReservation.id, secondReservation.id) as { id: string; status: string }[];

    expect(response.body).toEqual({ expired: 1, notified: 1 });
    expect(rows.find((row) => row.id === firstReservation.id)?.status).toBe("expired");
    expect(rows.find((row) => row.id === secondReservation.id)?.status).toBe("notified");
  });

  it("cancels only active reservations in the service layer", async () => {
    const { db, agent } = makeTestStack();
    const reservation = await reserve(agent, await createMember(agent, "Alice"), await createBook(agent, "Cancel Book"));

    expect(cancelReservation(db, reservation.id).status).toBe("cancelled");
    expect(() => cancelReservation(db, reservation.id)).toThrow("Reservation cannot be cancelled");
  });

  it("reports missing reservations from the service layer", () => {
    const { db } = makeTestStack();

    expect(() => getReservation(db, "00000000-0000-4000-8000-000000000000")).toThrow("Reservation not found");
  });

  it("does not notify a waiting reservation when no copy is available", async () => {
    const { db, agent } = makeTestStack();
    const book = await createBook(agent, "No Copy Notify");
    await borrow(agent, await createMember(agent, "Borrower"), book);
    const reservation = await reserve(agent, await createMember(agent, "Waiter"), book);

    expect(notifyWaitingReservationsForAvailableCopies(db, book.id, new Date())).toBe(0);
    expect(getReservation(db, reservation.id).status).toBe("waiting");
  });
});
