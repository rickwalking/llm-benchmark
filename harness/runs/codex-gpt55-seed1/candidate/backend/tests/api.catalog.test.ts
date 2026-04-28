import { describe, expect, it } from "vitest";
import { createBook, createMember, makeTestStack, reserve } from "./testUtils";
import { createBook as createBookService } from "../src/services/bookService";
import { createMember as createMemberService } from "../src/services/memberService";
import { queuePosition } from "../src/services/serviceHelpers";

describe("catalog and creation API", () => {
  it("AC-1.1: lists all books sorted by title with availability", async () => {
    const { agent } = makeTestStack();
    await createBook(agent, "zeta");
    await createBook(agent, "Alpha");

    const response = await agent.get("/api/books").expect(200);

    expect(response.body.map((book: { title: string }) => book.title)).toEqual(["Alpha", "zeta"]);
    expect(response.body[0]).toMatchObject({ total_copies: 1, available_copies: 1 });
  });

  it("AC-1.2: returns a book with current reservation queue depth", async () => {
    const { agent } = makeTestStack();
    const book = await createBook(agent, "Dune");
    await reserve(agent, await createMember(agent, "Alice"), book);
    await reserve(agent, await createMember(agent, "Ben"), book);

    const response = await agent.get(`/api/books/${book.id}`).expect(200);

    expect(response.body.reservation_queue_depth).toBe(2);
  });

  it("AC-1.4: returns 404 for a missing book", async () => {
    const { agent } = makeTestStack();

    const response = await agent.get("/api/books/00000000-0000-4000-8000-000000000000").expect(404);

    expect(response.body).toEqual({ error: "Book not found" });
  });

  it("AC-2.1 and AC-2.2: creates books and rejects duplicate ISBNs", async () => {
    const { agent } = makeTestStack();
    const payload = { title: "Kindred", author: "Octavia Butler", isbn: "9780807083697", total_copies: 2 };

    await agent.post("/api/books").send(payload).expect(201);
    const duplicate = await agent.post("/api/books").send({ ...payload, title: "Other" }).expect(409);

    expect(duplicate.body).toEqual({ error: "ISBN already exists" });
  });

  it("AC-2.3 and AC-2.4: creates members and rejects duplicate emails", async () => {
    const { agent } = makeTestStack();
    const payload = { name: "Alice Rivera", email: "alice@example.com" };

    await agent.post("/api/members").send(payload).expect(201);
    const duplicate = await agent.post("/api/members").send({ name: "Other", email: "ALICE@example.com" }).expect(409);

    expect(duplicate.body.error).toBe("Email already exists");
  });

  it("lists members by name", async () => {
    const { agent } = makeTestStack();
    await createMember(agent, "Zed");
    await createMember(agent, "Amy");

    const response = await agent.get("/api/members").expect(200);

    expect(response.body.map((member: { name: string }) => member.name)).toEqual(["Amy", "Zed"]);
  });

  it("service creation trims persisted book and member fields", () => {
    const { db } = makeTestStack();

    const book = createBookService(db, {
      title: "  Trimmed Book  ",
      author: "  Trimmed Author  ",
      isbn: "  123-456-7890  ",
      total_copies: 1
    });
    const member = createMemberService(db, { name: "  Trimmed Member  ", email: "  Trimmed@Example.com  " });

    expect(book).toMatchObject({ title: "Trimmed Book", author: "Trimmed Author", isbn: "123-456-7890" });
    expect(member).toMatchObject({ name: "Trimmed Member", email: "Trimmed@Example.com" });
  });

  it("returns null queue position for inactive reservations", async () => {
    const { db, agent } = makeTestStack();
    const reservation = await reserve(agent, await createMember(agent, "Inactive"), await createBook(agent, "Queue"));
    db.prepare("UPDATE reservations SET status = 'expired' WHERE id = ?").run(reservation.id);

    expect(queuePosition(db, { ...reservation, status: "expired" })).toBeNull();
  });
});
