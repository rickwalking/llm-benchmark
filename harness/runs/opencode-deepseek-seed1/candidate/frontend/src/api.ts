export interface Book {
  id: string;
  title: string;
  author: string;
  isbn: string;
  total_copies: number;
  available_copies: number;
}

export interface BookDetail extends Book {
  queue_depth: number;
  queue_position: {
    position: number | null;
    hasNotification: boolean;
    expiresIn: number | null;
  } | null;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  member_since: string;
  status: 'active' | 'suspended';
}

export interface MemberLoan {
  id: string;
  book_title: string;
  book_author: string;
  book_isbn: string;
  borrowed_at: string;
  due_at: string;
  returned_at: string | null;
}

export interface MemberReservation {
  id: string;
  book_id: string;
  book_title: string;
  book_author: string;
  queued_at: string;
  status: string;
  notified_at: string | null;
  expires_at: string | null;
}

export interface MemberFine {
  id: string;
  loan_id: string;
  book_title: string;
  amount_cents: number;
  paid_at: string | null;
}

export interface MemberDetail extends Member {
  unpaid_fines_cents: number;
  active_loans: MemberLoan[];
  reservations: MemberReservation[];
  fines: MemberFine[];
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
  status: string;
  notified_at: string | null;
  expires_at: string | null;
}

export interface Fine {
  id: string;
  member_id: string;
  loan_id: string;
  book_title: string;
  amount_cents: number;
  paid_at: string | null;
}

const BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new ApiError(body.error || res.statusText, res.status);
  }

  return res.json();
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const api = {
  books: {
    list: () => request<Book[]>('/books'),
    get: (id: string, memberId?: string) =>
      request<BookDetail>(`/books/${id}${memberId ? `?member_id=${memberId}` : ''}`),
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
      request<Loan>('/loans', { method: 'POST', body: JSON.stringify({ member_id: memberId, book_id: bookId }) }),
    return: (loanId: string) =>
      request<{ loan: Loan; fineCreated: boolean | null }>(`/loans/${loanId}/return`, { method: 'POST' }),
  },

  reservations: {
    create: (memberId: string, bookId: string) =>
      request<Reservation>('/reservations', { method: 'POST', body: JSON.stringify({ member_id: memberId, book_id: bookId }) }),
    cancel: (id: string) =>
      request<Reservation>(`/reservations/${id}/cancel`, { method: 'POST' }),
    expire: () =>
      request<{ expired_count: number }>('/reservations/expire', { method: 'POST' }),
  },

  fines: {
    pay: (id: string) =>
      request<Fine>(`/fines/${id}/pay`, { method: 'POST' }),
  },
};
