export type Book = {
  id: string;
  title: string;
  author: string;
  isbn: string;
  total_copies: number;
  available_copies: number;
  reservation_queue_depth: number;
  selected_member_reservation?: Reservation | null;
};

export type Member = {
  id: string;
  name: string;
  email: string;
  member_since: string;
  status: "active" | "suspended";
};

export type Loan = {
  id: string;
  book_id: string;
  member_id: string;
  borrowed_at: string;
  due_at: string;
  returned_at: string | null;
  book_title?: string;
  book_author?: string;
};

export type Reservation = {
  id: string;
  book_id: string;
  member_id: string;
  queued_at: string;
  status: "waiting" | "notified" | "expired" | "fulfilled" | "cancelled";
  notified_at: string | null;
  expires_at: string | null;
  book_title?: string;
  queue_position?: number | null;
};

export type Fine = {
  id: string;
  member_id: string;
  loan_id: string;
  amount_cents: number;
  paid_at: string | null;
  book_title?: string;
  due_at?: string;
};

export type MemberDetail = Member & {
  unpaid_fines_cents: number;
  active_loans: Loan[];
  reservations: Reservation[];
  unpaid_fines: Fine[];
};
