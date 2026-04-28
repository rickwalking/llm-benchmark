const API_BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface Book {
  id: string;
  title: string;
  author: string;
  isbn: string;
  total_copies: number;
  available_copies: number;
}

export interface BookDetail extends Book {
  reservation_queue_depth: number;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  member_since: string;
  status: 'active' | 'suspended';
  unpaid_fines_cents: number;
  active_loans: number;
}

export interface MemberDetail {
  id: string;
  name: string;
  email: string;
  member_since: string;
  status: 'active' | 'suspended';
  unpaid_fines_cents: number;
  active_loans: Loan[];
  reservations: Reservation[];
  fines: Fine[];
}

export interface Loan {
  id: string;
  book_id: string;
  member_id: string;
  borrowed_at: string;
  due_at: string;
  returned_at: string | null;
}

export interface Reservation {
  id: string;
  book_id: string;
  member_id: string;
  queued_at: string;
  status: 'waiting' | 'notified' | 'expired' | 'fulfilled' | 'cancelled';
  notified_at: string | null;
  expires_at: string | null;
}

export interface Fine {
  id: string;
  member_id: string;
  loan_id: string;
  amount_cents: number;
  paid_at: string | null;
}

export const api = {
  books: {
    list: () => request<Book[]>('/books'),
    get: (id: string) => request<BookDetail>(`/books/${id}`),
    create: (data: { title: string; author: string; isbn: string; total_copies: number }) =>
      request<Book>('/books', { method: 'POST', body: JSON.stringify(data) }),
  },
  members: {
    list: () => request<Member[]>('/members'),
    get: (id: string) => request<MemberDetail>(`/members/${id}`),
    create: (data: { name: string; email: string }) =>
      request<Member>('/members', { method: 'POST', body: JSON.stringify(data) }),
  },
  loans: {
    borrow: (memberId: string, bookId: string) =>
      request<Loan>('/loans', {
        method: 'POST',
        body: JSON.stringify({ member_id: memberId, book_id: bookId }),
      }),
    returnLoan: (id: string) =>
      request<Loan>(`/loans/${id}/return`, { method: 'POST' }),
  },
  reservations: {
    create: (memberId: string, bookId: string) =>
      request<Reservation>('/reservations', {
        method: 'POST',
        body: JSON.stringify({ member_id: memberId, book_id: bookId }),
      }),
    cancel: (id: string) =>
      request<Reservation>(`/reservations/${id}/cancel`, { method: 'POST' }),
    expire: () => request<{ expired: number }>('/reservations/expire', { method: 'POST' }),
  },
  fines: {
    pay: (id: string) => request<Fine>(`/fines/${id}/pay`, { method: 'POST' }),
  },
};