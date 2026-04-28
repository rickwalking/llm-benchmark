export type Status = "active" | "suspended";
export type ReservationStatus = "waiting" | "notified" | "expired" | "fulfilled" | "cancelled";

export type BookRow = {
  id: string;
  title: string;
  author: string;
  isbn: string;
  total_copies: number;
};

export type Book = BookRow & {
  available_copies: number;
  reservation_queue_depth: number;
};

export type MemberRow = {
  id: string;
  name: string;
  email: string;
  member_since: string;
  status: Status;
};

export type LoanRow = {
  id: string;
  book_id: string;
  member_id: string;
  borrowed_at: string;
  due_at: string;
  returned_at: string | null;
};

export type ReservationRow = {
  id: string;
  book_id: string;
  member_id: string;
  queued_at: string;
  status: ReservationStatus;
  notified_at: string | null;
  expires_at: string | null;
};

export type FineRow = {
  id: string;
  member_id: string;
  loan_id: string;
  amount_cents: number;
  paid_at: string | null;
};

export type NamedLoan = LoanRow & {
  book_title: string;
  book_author: string;
};

export type ReservationWithBook = ReservationRow & {
  book_title: string;
  queue_position: number | null;
};

export type FineWithLoan = FineRow & {
  book_title: string;
  due_at: string;
};
