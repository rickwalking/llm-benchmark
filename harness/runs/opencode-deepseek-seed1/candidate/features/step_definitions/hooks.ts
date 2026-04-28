import { Before, After } from '@cucumber/cucumber';
import Database from 'better-sqlite3';
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { v4 as uuid } from 'uuid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '..', '..', 'backend', 'migrations');

function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  if (fs.existsSync(migrationsDir)) {
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      db.exec(sql);
    }
  }
  return db;
}

interface BookRow {
  id: string;
  title: string;
  author: string;
  isbn: string;
  total_copies: number;
  available_copies: number;
}

interface MemberRow {
  id: string;
  name: string;
  email: string;
  member_since: string;
  status: string;
}

interface LoanRow {
  id: string;
  book_id: string;
  member_id: string;
  borrowed_at: string;
  due_at: string;
  returned_at: string | null;
}

interface ReservationRow {
  id: string;
  book_id: string;
  member_id: string;
  queued_at: string;
  status: string;
  notified_at: string | null;
  expires_at: string | null;
}

interface FineRow {
  id: string;
  member_id: string;
  loan_id: string;
  amount_cents: number;
  paid_at: string | null;
}

interface CountResult {
  count: number;
  total: number;
}

declare module '@cucumber/cucumber' {
  interface World {
    db: Database.Database;
    server: http.Server;
    baseUrl: string;
    lastResponse: { status: number; body: unknown };
    context: Record<string, string>;
  }
}

Before(function () {
  const db = createTestDb();
  this.db = db;
  this.lastResponse = { status: 0, body: null };
  this.context = {};

  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  // Books
  app.get('/api/books', (_req: Request, res: Response) => {
    const rows = db.prepare(`
      SELECT b.*,
        b.total_copies - COALESCE(l.active_loans, 0) - COALESCE(n.notified_count, 0) as available_copies
      FROM books b
      LEFT JOIN (
        SELECT book_id, COUNT(*) as active_loans FROM loans WHERE returned_at IS NULL GROUP BY book_id
      ) l ON l.book_id = b.id
      LEFT JOIN (
        SELECT book_id, COUNT(*) as notified_count FROM reservations WHERE status = 'notified' GROUP BY book_id
      ) n ON n.book_id = b.id
      ORDER BY b.title COLLATE NOCASE ASC
    `).all() as BookRow[];
    res.json(rows);
  });

  app.get('/api/books/:id', (req: Request, res: Response) => {
    const row = db.prepare(`
      SELECT b.*,
        b.total_copies - COALESCE(l.active_loans, 0) - COALESCE(n.notified_count, 0) as available_copies
      FROM books b
      LEFT JOIN (
        SELECT book_id, COUNT(*) as active_loans FROM loans WHERE returned_at IS NULL GROUP BY book_id
      ) l ON l.book_id = b.id
      LEFT JOIN (
        SELECT book_id, COUNT(*) as notified_count FROM reservations WHERE status = 'notified' GROUP BY book_id
      ) n ON n.book_id = b.id
      WHERE b.id = ?
    `).get(req.params.id) as BookRow | undefined;
    if (!row) { res.status(404).json({ error: 'Book not found' }); return; }

    const queueDepth = db.prepare(
      "SELECT COUNT(*) as count FROM reservations WHERE book_id = ? AND status IN ('waiting', 'notified')"
    ).get(req.params.id) as CountResult;

    res.json({ ...row, queue_depth: queueDepth.count });
  });

  app.post('/api/books', (req: Request, res: Response) => {
    const { title, author, isbn, total_copies } = req.body as { title: string; author: string; isbn: string; total_copies: number };
    const existing = db.prepare('SELECT id FROM books WHERE isbn = ?').get(isbn);
    if (existing) { res.status(409).json({ error: 'ISBN already exists' }); return; }
    const id = uuid();
    db.prepare('INSERT INTO books (id, title, author, isbn, total_copies) VALUES (?, ?, ?, ?, ?)')
      .run(id, title, author, isbn, total_copies);
    res.status(201).json({ id, title, author, isbn, total_copies, available_copies: total_copies });
  });

  // Members
  app.get('/api/members', (_req: Request, res: Response) => {
    res.json(db.prepare('SELECT id, name, email, member_since, status FROM members ORDER BY name COLLATE NOCASE ASC').all() as MemberRow[]);
  });

  app.get('/api/members/:id', (req: Request, res: Response) => {
    const member = db.prepare('SELECT id, name, email, member_since, status FROM members WHERE id = ?').get(req.params.id) as MemberRow | undefined;
    if (!member) { res.status(404).json({ error: 'Member not found' }); return; }
    const unpaidFines = db.prepare('SELECT COALESCE(SUM(amount_cents), 0) as total FROM fines WHERE member_id = ? AND paid_at IS NULL').get(req.params.id) as CountResult;
    res.json({ ...member, unpaid_fines_cents: unpaidFines.total });
  });

  app.post('/api/members', (req: Request, res: Response) => {
    const { name, email } = req.body as { name: string; email: string };
    const existing = db.prepare('SELECT id FROM members WHERE email = ?').get(email);
    if (existing) { res.status(409).json({ error: 'Email already exists' }); return; }
    const id = uuid();
    db.prepare('INSERT INTO members (id, name, email, member_since, status) VALUES (?, ?, ?, ?, ?)')
      .run(id, name, email, new Date().toISOString().split('T')[0], 'active');
    res.status(201).json({ id, name, email, member_since: new Date().toISOString().split('T')[0], status: 'active', unpaid_fines_cents: 0 });
  });

  // Loans
  app.post('/api/loans', (req: Request, res: Response) => {
    const { member_id, book_id } = req.body as { member_id: string; book_id: string };
    const member = db.prepare('SELECT id, status FROM members WHERE id = ?').get(member_id) as MemberRow | undefined;
    if (!member) { res.status(404).json({ error: 'Member not found' }); return; }

    const book = db.prepare(`
      SELECT b.*, b.total_copies - COALESCE(l.cnt, 0) as available_copies
      FROM books b LEFT JOIN (SELECT book_id, COUNT(*) as cnt FROM loans WHERE returned_at IS NULL GROUP BY book_id) l ON l.book_id = b.id
      WHERE b.id = ?
    `).get(book_id) as BookRow | undefined;
    if (!book) { res.status(404).json({ error: 'Book not found' }); return; }

    if (member.status === 'suspended') { res.status(403).json({ error: 'Member is suspended' }); return; }

    const activeLoans = db.prepare('SELECT COUNT(*) as cnt FROM loans WHERE member_id = ? AND returned_at IS NULL').get(member_id) as { cnt: number };
    if (activeLoans.cnt >= 5) { res.status(409).json({ error: 'Loan limit reached' }); return; }

    const unpaidFines = db.prepare('SELECT COALESCE(SUM(amount_cents), 0) as total FROM fines WHERE member_id = ? AND paid_at IS NULL').get(member_id) as CountResult;
    if (unpaidFines.total > 500) { res.status(402).json({ error: 'Outstanding fines exceed limit' }); return; }

    if (book.available_copies <= 0) {
      const headRes = db.prepare("SELECT * FROM reservations WHERE book_id = ? AND status = 'notified' ORDER BY queued_at ASC LIMIT 1").get(book_id) as ReservationRow | undefined;
      if (headRes) {
        if (headRes.member_id !== member_id) { res.status(409).json({ error: 'Book is reserved for another member' }); return; }
      } else {
        res.status(409).json({ error: 'No copies available — reserve instead' }); return;
      }
    }

    const id = uuid();
    const borrowedAt = new Date();
    const dueAt = new Date(borrowedAt.getTime() + 14 * 24 * 60 * 60 * 1000);
    db.prepare('INSERT INTO loans (id, book_id, member_id, borrowed_at, due_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, book_id, member_id, borrowedAt.toISOString(), dueAt.toISOString());

    // Fulfill notified reservation
    const reservation = db.prepare("SELECT * FROM reservations WHERE book_id = ? AND member_id = ? AND status = 'notified' LIMIT 1").get(book_id, member_id) as ReservationRow | undefined;
    if (reservation) {
      db.prepare("UPDATE reservations SET status = 'fulfilled' WHERE id = ?").run(reservation.id);
    }

    res.status(201).json({ id, book_id, member_id, borrowed_at: borrowedAt.toISOString(), due_at: dueAt.toISOString(), returned_at: null });
  });

  app.post('/api/loans/:id/return', (req: Request, res: Response) => {
    const loan = db.prepare('SELECT * FROM loans WHERE id = ?').get(req.params.id) as LoanRow | undefined;
    if (!loan) { res.status(404).json({ error: 'Loan not found' }); return; }
    if (loan.returned_at) { res.status(409).json({ error: 'Loan already returned' }); return; }

    const returnedAt = new Date();
    const resLoan: { loan: LoanRow | null; fineCreated: boolean } = { loan: null, fineCreated: false };

    const diffMs = returnedAt.getTime() - new Date(loan.due_at).getTime();
    const daysLate = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (daysLate > 0) {
      const fineCents = Math.min(daysLate * 50, 1000);
      const fineId = uuid();
      db.prepare('INSERT INTO fines (id, member_id, loan_id, amount_cents) VALUES (?, ?, ?, ?)')
        .run(fineId, loan.member_id, loan.id, fineCents);
      resLoan.fineCreated = true;
    }

    db.prepare('UPDATE loans SET returned_at = ? WHERE id = ?').run(returnedAt.toISOString(), loan.id);
    resLoan.loan = db.prepare('SELECT * FROM loans WHERE id = ?').get(loan.id) as LoanRow;

    // Notify next reservation
    const nextRes = db.prepare("SELECT * FROM reservations WHERE book_id = ? AND status = 'waiting' ORDER BY queued_at ASC LIMIT 1").get(loan.book_id) as ReservationRow | undefined;
    if (nextRes) {
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
      db.prepare("UPDATE reservations SET status = 'notified', notified_at = ?, expires_at = ? WHERE id = ?")
        .run(new Date().toISOString(), expiresAt.toISOString(), nextRes.id);
    }

    res.json(resLoan);
  });

  // Reservations
  app.post('/api/reservations', (req: Request, res: Response) => {
    const { member_id, book_id } = req.body as { member_id: string; book_id: string };
    const existingLoan = db.prepare('SELECT id FROM loans WHERE member_id = ? AND book_id = ? AND returned_at IS NULL').get(member_id, book_id);
    if (existingLoan) { res.status(409).json({ error: 'Member already has this book on loan' }); return; }
    const existingRes = db.prepare("SELECT id FROM reservations WHERE member_id = ? AND book_id = ? AND status IN ('waiting', 'notified')").get(member_id, book_id);
    if (existingRes) { res.status(409).json({ error: 'Duplicate reservation' }); return; }

    const id = uuid();
    db.prepare('INSERT INTO reservations (id, book_id, member_id, queued_at, status) VALUES (?, ?, ?, ?, ?)')
      .run(id, book_id, member_id, new Date().toISOString(), 'waiting');
    res.status(201).json({ id, book_id, member_id, queued_at: new Date().toISOString(), status: 'waiting', notified_at: null, expires_at: null });
  });

  app.post('/api/reservations/expire', (_req: Request, res: Response) => {
    let count = 0;
    const stale = db.prepare("SELECT * FROM reservations WHERE status = 'notified' AND expires_at < ?").all(new Date().toISOString()) as ReservationRow[];
    for (const s of stale) {
      db.prepare("UPDATE reservations SET status = 'expired' WHERE id = ?").run(s.id);
      count++;
      const next = db.prepare("SELECT * FROM reservations WHERE book_id = ? AND status = 'waiting' ORDER BY queued_at ASC LIMIT 1").get(s.book_id) as ReservationRow | undefined;
      if (next) {
        const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
        db.prepare("UPDATE reservations SET status = 'notified', notified_at = ?, expires_at = ? WHERE id = ?")
          .run(new Date().toISOString(), expiresAt.toISOString(), next.id);
      }
    }
    res.json({ expired_count: count });
  });

  // Fines
  app.post('/api/fines/:id/pay', (req: Request, res: Response) => {
    const fine = db.prepare('SELECT * FROM fines WHERE id = ?').get(req.params.id) as FineRow | undefined;
    if (!fine) { res.status(404).json({ error: 'Fine not found' }); return; }
    if (fine.paid_at) { res.status(409).json({ error: 'Fine already paid' }); return; }
    const paidAt = new Date().toISOString();
    db.prepare('UPDATE fines SET paid_at = ? WHERE id = ?').run(paidAt, req.params.id);
    res.json({ ...fine, paid_at: paidAt });
  });

  return new Promise<void>((resolve) => {
    const server = app.listen(0, () => {
      const addr = server.address() as { port: number };
      this.baseUrl = `http://localhost:${addr.port}`;
      this.server = server;
      resolve();
    });
  });
});

After(function () {
  return new Promise<void>((resolve) => {
    this.server.close(() => {
      this.db.close();
      resolve();
    });
  });
});
