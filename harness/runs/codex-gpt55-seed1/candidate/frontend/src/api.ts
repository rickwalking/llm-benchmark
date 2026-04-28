import type { Book, Fine, Loan, Member, MemberDetail, Reservation } from "./types";

const API_BASE = "http://localhost:3002";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  });
  const payload = (await response.json()) as { error?: string };
  if (!response.ok) {
    throw new ApiError(payload.error ?? "Request failed", response.status);
  }
  return payload as T;
}

export const api = {
  books: () => request<Book[]>("/api/books"),
  book: (id: string, memberId?: string) =>
    request<Book>(`/api/books/${id}${memberId ? `?member_id=${encodeURIComponent(memberId)}` : ""}`),
  createBook: (body: { title: string; author: string; isbn: string; total_copies: number }) =>
    request<Book>("/api/books", { method: "POST", body: JSON.stringify(body) }),
  members: () => request<Member[]>("/api/members"),
  member: (id: string) => request<MemberDetail>(`/api/members/${id}`),
  createMember: (body: { name: string; email: string }) =>
    request<Member>("/api/members", { method: "POST", body: JSON.stringify(body) }),
  borrow: (body: { member_id: string; book_id: string }) =>
    request<Loan>("/api/loans", { method: "POST", body: JSON.stringify(body) }),
  returnLoan: (id: string) => request<{ loan: Loan }>(`/api/loans/${id}/return`, { method: "POST" }),
  reserve: (body: { member_id: string; book_id: string }) =>
    request<Reservation>("/api/reservations", { method: "POST", body: JSON.stringify(body) }),
  payFine: (id: string) => request<Fine>(`/api/fines/${id}/pay`, { method: "POST" })
};
