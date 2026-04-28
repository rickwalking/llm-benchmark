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
  active_loans: number;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  member_since: string;
  status: 'active' | 'suspended';
}

export interface Loan {
  id: string;
  book_id: string;
  member_id: string;
  borrowed_at: string;
  due_at: string;
  returned_at: string | null;
  book_title?: string;
  book_author?: string;
  warnings?: string[];
}

export interface Reservation {
  id: string;
  book_id: string;
  member_id: string;
  queued_at: string;
  status: 'waiting' | 'notified' | 'expired' | 'fulfilled' | 'cancelled';
  notified_at: string | null;
  expires_at: string | null;
  book_title?: string;
  position?: number;
}

export interface Fine {
  id: string;
  member_id: string;
  loan_id: string;
  amount_cents: number;
  paid_at: string | null;
  created_at: string;
  book_title?: string;
}

export interface MemberDetail extends Member {
  active_loans: Loan[];
  reservations: Reservation[];
  unpaid_fines: Fine[];
  unpaid_fines_cents: number;
}

export interface ApiError {
  error: string;
  details?: unknown;
}
