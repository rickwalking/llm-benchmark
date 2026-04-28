import type {
  ApiError,
  Book,
  BookDetail,
  Fine,
  Loan,
  Member,
  MemberDetail,
  Reservation,
} from './types';

export class HttpError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
    this.name = 'HttpError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (init.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(path, { ...init, headers });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const err = (data ?? { error: res.statusText }) as ApiError;
    throw new HttpError(res.status, err.error ?? 'Request failed', err.details);
  }
  return data as T;
}

export const api = {
  listBooks: () => request<Book[]>('/api/books'),
  getBook: (id: string) => request<BookDetail>(`/api/books/${id}`),
  createBook: (input: Omit<Book, 'id' | 'available_copies'>) =>
    request<Book>('/api/books', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  listMembers: () => request<Member[]>('/api/members'),
  getMember: (id: string) => request<MemberDetail>(`/api/members/${id}`),
  createMember: (input: { name: string; email: string }) =>
    request<Member>('/api/members', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  borrow: (input: { member_id: string; book_id: string }) =>
    request<Loan>('/api/loans', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  returnLoan: (loanId: string) =>
    request<{ loan: Loan; fine_cents: number; fine_id: string | null; notified_reservation_id: string | null }>(
      `/api/loans/${loanId}/return`,
      { method: 'POST' },
    ),
  reserve: (input: { member_id: string; book_id: string }) =>
    request<Reservation>('/api/reservations', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  cancelReservation: (id: string) =>
    request<Reservation>(`/api/reservations/${id}`, { method: 'DELETE' }),
  expireReservations: () =>
    request<{ expired_count: number }>('/api/reservations/expire', {
      method: 'POST',
    }),
  payFine: (id: string) =>
    request<Fine>(`/api/fines/${id}/pay`, { method: 'POST' }),
};
