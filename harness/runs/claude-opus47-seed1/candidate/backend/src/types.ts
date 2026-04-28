export interface BookRow {
  id: string;
  title: string;
  author: string;
  isbn: string;
  total_copies: number;
}

export interface BookView extends BookRow {
  available_copies: number;
}

export interface BookDetailView extends BookView {
  reservation_queue_depth: number;
  active_loans: number;
}

export interface MemberRow {
  id: string;
  name: string;
  email: string;
  member_since: string;
  status: 'active' | 'suspended';
}

export interface LoanRow {
  id: string;
  book_id: string;
  member_id: string;
  borrowed_at: string;
  due_at: string;
  returned_at: string | null;
}

export interface LoanView extends LoanRow {
  book_title?: string;
  book_author?: string;
  member_name?: string;
}

export interface ReservationRow {
  id: string;
  book_id: string;
  member_id: string;
  queued_at: string;
  status: 'waiting' | 'notified' | 'expired' | 'fulfilled' | 'cancelled';
  notified_at: string | null;
  expires_at: string | null;
}

export interface ReservationView extends ReservationRow {
  book_title?: string;
  member_name?: string;
  position?: number;
}

export interface FineRow {
  id: string;
  member_id: string;
  loan_id: string;
  amount_cents: number;
  paid_at: string | null;
  created_at: string;
}

export interface FineView extends FineRow {
  book_title?: string;
}

export interface MemberDetailView extends MemberRow {
  active_loans: LoanView[];
  reservations: ReservationView[];
  unpaid_fines: FineView[];
  unpaid_fines_cents: number;
}
