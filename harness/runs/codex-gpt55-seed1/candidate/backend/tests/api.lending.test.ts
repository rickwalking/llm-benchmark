import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { borrow, createBook, createMember, insertFine, makeTestStack, reserve } from "./testUtils";

describe("loan and return API", () => {
  it("AC-3.1: creates a loan and decreases available copies", async () => {
    const { agent } = makeTestStack();
    const member = await createMember(agent, "Alice");
    const book = await createBook(agent, "Dune", 2);

    const loanResponse = await agent.post("/api/loans").send({ member_id: member.id, book_id: book.id }).expect(201);
    const bookResponse = await agent.get(`/api/books/${book.id}`).expect(200);

    expect(loanResponse.body.due_at).toBeTruthy();
    expect(bookResponse.body.available_copies).toBe(1);
  });

  it("AC-3.2: rejects the sixth active loan", async () => {
    const { agent } = makeTestStack();
    const member = await createMember(agent, "Alice");
    for (let index = 0; index < 5; index += 1) {
      await borrow(agent, member, await createBook(agent, `Book ${index}`));
    }

    const response = await agent
      .post("/api/loans")
      .send({ member_id: member.id, book_id: (await createBook(agent, "Book 6")).id })
      .expect(409);

    expect(response.body).toEqual({ error: "Loan limit reached" });
  });

  it("AC-3.3: rejects suspended members", async () => {
    const { db, agent } = makeTestStack();
    const member = await createMember(agent, "Suspended");
    const book = await createBook(agent, "Beloved");
    db.prepare("UPDATE members SET status = 'suspended' WHERE id = ?").run(member.id);

    const response = await agent.post("/api/loans").send({ member_id: member.id, book_id: book.id }).expect(403);

    expect(response.body).toEqual({ error: "Member is suspended" });
  });

  it("AC-3.4: rejects members whose unpaid fines exceed the threshold", async () => {
    const { db, agent } = makeTestStack();
    const member = await createMember(agent, "Fined");
    const firstBook = await createBook(agent, "Fine Source");
    const loan = await borrow(agent, member, firstBook);
    insertFine(db, member, loan, 501);

    const response = await agent
      .post("/api/loans")
      .send({ member_id: member.id, book_id: (await createBook(agent, "Blocked Book")).id })
      .expect(402);

    expect(response.body).toEqual({ error: "Outstanding fines exceed limit" });
  });

  it("AC-3.5: rejects borrowing when no copy is available", async () => {
    const { agent } = makeTestStack();
    const book = await createBook(agent, "Single Copy");
    await borrow(agent, await createMember(agent, "Alice"), book);

    const response = await agent
      .post("/api/loans")
      .send({ member_id: (await createMember(agent, "Ben")).id, book_id: book.id })
      .expect(409);

    expect(response.body).toEqual({ error: "No copies available — reserve instead" });
  });

  it("AC-4.1 and AC-4.3: returns a loan once and rejects a second return", async () => {
    const { agent } = makeTestStack();
    const member = await createMember(agent, "Alice");
    const book = await createBook(agent, "Returnable");
    const loan = await borrow(agent, member, book);

    const firstReturn = await agent.post(`/api/loans/${loan.id}/return`).expect(200);
    const second = await agent.post(`/api/loans/${loan.id}/return`).expect(409);
    const bookAfter = await agent.get(`/api/books/${book.id}`).expect(200);

    expect(firstReturn.body.fine).toBeNull();
    expect(second.body).toEqual({ error: "Loan already returned" });
    expect(bookAfter.body.available_copies).toBe(1);
  });

  it("AC-4.2: creates capped late fines from days late", async () => {
    const { db, agent } = makeTestStack();
    const member = await createMember(agent, "Late");
    const loan = await borrow(agent, member, await createBook(agent, "Late Book"));
    const dueAt = new Date(Date.now() - 2.5 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare("UPDATE loans SET due_at = ? WHERE id = ?").run(dueAt, loan.id);

    const response = await agent.post(`/api/loans/${loan.id}/return`).expect(200);
    const memberResponse = await agent.get(`/api/members/${member.id}`).expect(200);

    expect(response.body.fine.amount_cents).toBe(150);
    expect(memberResponse.body.unpaid_fines_cents).toBe(150);
  });

  it("AC-4.4: notifies the head reservation and keeps the returned copy held", async () => {
    const { agent } = makeTestStack();
    const book = await createBook(agent, "Reserved Return");
    const borrower = await createMember(agent, "Borrower");
    const waiter = await createMember(agent, "Waiter");
    const loan = await borrow(agent, borrower, book);
    await reserve(agent, waiter, book);

    await agent.post(`/api/loans/${loan.id}/return`).expect(200);
    const detail = await agent.get(`/api/books/${book.id}?member_id=${waiter.id}`).expect(200);

    expect(detail.body.available_copies).toBe(0);
    expect(detail.body.selected_member_reservation.status).toBe("notified");
    expect(detail.body.selected_member_reservation.expires_at).toBeTruthy();
  });

  it("allows borrowing an available copy while another member only has a waiting reservation", async () => {
    const { agent } = makeTestStack();
    const book = await createBook(agent, "Available With Queue", 2);
    await reserve(agent, await createMember(agent, "Waiter"), book);

    await agent
      .post("/api/loans")
      .send({ member_id: (await createMember(agent, "Borrower")).id, book_id: book.id })
      .expect(201);
  });

  it("AC-6.1, AC-6.2, and AC-6.3: reports, pays, and rejects repaying fines", async () => {
    const { db, agent } = makeTestStack();
    const member = await createMember(agent, "Payer");
    const loan = await borrow(agent, member, await createBook(agent, "Fine Book"));
    const fine = insertFine(db, member, loan, 250);

    expect((await agent.get(`/api/members/${member.id}`).expect(200)).body.unpaid_fines_cents).toBe(250);
    await agent.post(`/api/fines/${fine.id}/pay`).expect(200);
    const duplicate = await agent.post(`/api/fines/${fine.id}/pay`).expect(409);

    expect(duplicate.body.error).toBe("Fine already paid");
  });

  it("returns 404 for missing loans", async () => {
    const { agent } = makeTestStack();

    const response = await agent.post(`/api/loans/${randomUUID()}/return`).expect(404);

    expect(response.body.error).toBe("Loan not found");
  });

  it("returns 404 for missing fines", async () => {
    const { agent } = makeTestStack();

    const response = await agent.post(`/api/fines/${randomUUID()}/pay`).expect(404);

    expect(response.body.error).toBe("Fine not found");
  });
});
