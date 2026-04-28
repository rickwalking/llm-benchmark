-- Books
CREATE TABLE IF NOT EXISTS books (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    isbn TEXT NOT NULL UNIQUE,
    total_copies INTEGER NOT NULL CHECK (total_copies >= 1),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_books_title ON books(title COLLATE NOCASE);

-- Members
CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    member_since TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Loans
CREATE TABLE IF NOT EXISTS loans (
    id TEXT PRIMARY KEY NOT NULL,
    book_id TEXT NOT NULL REFERENCES books(id),
    member_id TEXT NOT NULL REFERENCES members(id),
    borrowed_at TEXT NOT NULL,
    due_at TEXT NOT NULL,
    returned_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_loans_member_active ON loans(member_id) WHERE returned_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_loans_book_active ON loans(book_id) WHERE returned_at IS NULL;

-- Reservations
CREATE TABLE IF NOT EXISTS reservations (
    id TEXT PRIMARY KEY NOT NULL,
    book_id TEXT NOT NULL REFERENCES books(id),
    member_id TEXT NOT NULL REFERENCES members(id),
    queued_at TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('waiting', 'notified', 'expired', 'fulfilled', 'cancelled')),
    notified_at TEXT,
    expires_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_reservations_book_status ON reservations(book_id, status);
CREATE INDEX IF NOT EXISTS idx_reservations_member ON reservations(member_id, status);

-- Fines
CREATE TABLE IF NOT EXISTS fines (
    id TEXT PRIMARY KEY NOT NULL,
    member_id TEXT NOT NULL REFERENCES members(id),
    loan_id TEXT NOT NULL REFERENCES loans(id),
    amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
    paid_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fines_member_unpaid ON fines(member_id) WHERE paid_at IS NULL;
