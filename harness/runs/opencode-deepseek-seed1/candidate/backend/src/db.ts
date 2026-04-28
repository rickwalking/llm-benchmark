import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { v4 as uuid } from 'uuid';
import type { Book, Member } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'library.db');

let db: Database.Database | null = null;
let testDbOverride: Database.Database | null = null;

export function setTestDb(database: Database.Database) {
  testDbOverride = database;
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function applyMigrations(database: Database.Database) {
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  if (!fs.existsSync(migrationsDir)) return;

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  database.exec("CREATE TABLE IF NOT EXISTS _migrations (filename TEXT PRIMARY KEY)");

  for (const file of files) {
    const already = database.prepare('SELECT 1 FROM _migrations WHERE filename = ?').get(file);
    if (already) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    database.exec(sql);
    database.prepare('INSERT INTO _migrations (filename) VALUES (?)').run(file);
  }
}

function seed(database: Database.Database) {
  const count = database.prepare('SELECT COUNT(*) as cnt FROM members').get() as { cnt: number };
  if (count.cnt > 0) return;

  const insertMember = database.prepare('INSERT INTO members (id, name, email, member_since, status) VALUES (?, ?, ?, ?, ?)');
  const insertBook = database.prepare('INSERT INTO books (id, title, author, isbn, total_copies) VALUES (?, ?, ?, ?, ?)');

  const members: Array<Omit<Member, 'unpaid_fines_cents'>> = [
    { id: uuid(), name: 'Alice Johnson', email: 'alice@example.com', member_since: '2024-01-15', status: 'active' },
    { id: uuid(), name: 'Bob Smith', email: 'bob@example.com', member_since: '2024-03-22', status: 'active' },
    { id: uuid(), name: 'Carol Williams', email: 'carol@example.com', member_since: '2024-06-10', status: 'active' },
    { id: uuid(), name: 'Dave Brown', email: 'dave@example.com', member_since: '2024-09-05', status: 'active' },
    { id: uuid(), name: 'Eve Davis', email: 'eve@example.com', member_since: '2025-01-01', status: 'active' },
  ];

  const books: Book[] = [
    { id: uuid(), title: 'Dune', author: 'Frank Herbert', isbn: '978-0441172719', total_copies: 4, available_copies: 4 },
    { id: uuid(), title: 'Foundation', author: 'Isaac Asimov', isbn: '978-0553293357', total_copies: 3, available_copies: 3 },
    { id: uuid(), title: 'Neuromancer', author: 'William Gibson', isbn: '978-0441569595', total_copies: 2, available_copies: 2 },
    { id: uuid(), title: '1984', author: 'George Orwell', isbn: '978-0451524935', total_copies: 5, available_copies: 5 },
    { id: uuid(), title: 'Brave New World', author: 'Aldous Huxley', isbn: '978-0060850524', total_copies: 3, available_copies: 3 },
    { id: uuid(), title: 'Fahrenheit 451', author: 'Ray Bradbury', isbn: '978-1451673319', total_copies: 2, available_copies: 2 },
    { id: uuid(), title: 'The Hobbit', author: 'J.R.R. Tolkien', isbn: '978-0547928227', total_copies: 4, available_copies: 4 },
    { id: uuid(), title: 'The Left Hand of Darkness', author: 'Ursula K. Le Guin', isbn: '978-0441478125', total_copies: 2, available_copies: 2 },
    { id: uuid(), title: 'Ender\'s Game', author: 'Orson Scott Card', isbn: '978-0812550702', total_copies: 3, available_copies: 3 },
    { id: uuid(), title: 'Snow Crash', author: 'Neal Stephenson', isbn: '978-0553380958', total_copies: 2, available_copies: 2 },
  ];

  const tx = database.transaction(() => {
    for (const m of members) {
      insertMember.run(m.id, m.name, m.email, m.member_since, m.status);
    }
    for (const b of books) {
      insertBook.run(b.id, b.title, b.author, b.isbn, b.total_copies);
    }
  });

  tx();
}

export function getDb(inMemory = false): Database.Database {
  if (testDbOverride) return testDbOverride;
  if (db) return db;

  if (inMemory) {
    db = new Database(':memory:');
  } else {
    ensureDataDir();
    db = new Database(DB_PATH);
  }

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  applyMigrations(db);
  if (!inMemory) {
    seed(db);
  }

  return db;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

export function createTestDb(): Database.Database {
  const testDb = new Database(':memory:');
  testDb.pragma('foreign_keys = ON');

  const migrationsDir = path.join(__dirname, '..', 'migrations');
  if (fs.existsSync(migrationsDir)) {
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      testDb.exec(sql);
    }
  }

  return testDb;
}
