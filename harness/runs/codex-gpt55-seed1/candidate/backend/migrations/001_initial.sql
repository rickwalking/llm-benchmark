CREATE TABLE books (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  isbn TEXT NOT NULL,
  isbn_digits TEXT NOT NULL UNIQUE,
  total_copies INTEGER NOT NULL CHECK (total_copies >= 1)
);

CREATE TABLE members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  email_normalized TEXT NOT NULL UNIQUE,
  member_since TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended'))
);

CREATE TABLE loans (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  borrowed_at TEXT NOT NULL,
  due_at TEXT NOT NULL,
  returned_at TEXT
);

CREATE TABLE reservations (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  queued_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('waiting', 'notified', 'expired', 'fulfilled', 'cancelled')),
  notified_at TEXT,
  expires_at TEXT
);

CREATE TABLE fines (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  loan_id TEXT NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  paid_at TEXT
);

CREATE INDEX loans_book_active_idx ON loans(book_id, returned_at);
CREATE INDEX loans_member_active_idx ON loans(member_id, returned_at);
CREATE INDEX reservations_book_status_idx ON reservations(book_id, status, queued_at);
CREATE INDEX reservations_member_status_idx ON reservations(member_id, status);
CREATE INDEX fines_member_unpaid_idx ON fines(member_id, paid_at);
