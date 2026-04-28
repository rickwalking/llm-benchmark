export interface Book {
  id: string;
  title: string;
  author: string;
  isbn: string;
  total_copies: number;
  available_copies: number;
}

export interface BookWithQueue extends Book {
  queue_depth: number;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  member_since: string;
  status: 'active' | 'suspended';
}

export interface MemberWithStats extends Member {
  active_loans: number;
  unpaid_fines_cents: number;
}

export interface Loan {
  id: string;
  book_id: string;
  member_id: string;
  borrowed_at: string;
  due_at: string;
  returned_at: string | null;
}

export interface LoanWithBook extends Loan {
  book_title: string;
  days_overdue: number;
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

export interface ReservationWithBook extends Reservation {
  book_title: string;
  queue_position: number;
}

export interface Fine {
  id: string;
  member_id: string;
  loan_id: string;
  amount_cents: number;
  paid_at: string | null;
  book_title: string;
}
