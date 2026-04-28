export interface Book {
  id: string;
  title: string;
  author: string;
  isbn: string;
  total_copies: number;
  available_copies: number;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  member_since: string;
  status: 'active' | 'suspended';
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
