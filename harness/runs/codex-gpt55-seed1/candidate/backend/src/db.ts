import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type { Db } from "./services/dbTypes";

export type { Db } from "./services/dbTypes";

type MigrationRow = { id: string };
type CountRow = { count: number };

export function configureDatabase(db: Db): void {
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
}

export function resolveBackendPath(...segments: string[]): string {
  const rootScoped = path.resolve(process.cwd(), "backend", ...segments);
  if (existsSync(path.resolve(process.cwd(), "backend"))) {
    return rootScoped;
  }
  return path.resolve(process.cwd(), ...segments);
}

export function openDatabase(filename = resolveBackendPath("data", "library.db")): Db {
  mkdirSync(path.dirname(filename), { recursive: true });
  const db = new Database(filename);
  configureDatabase(db);
  runMigrations(db);
  seedDatabase(db);
  return db;
}

export function createMemoryDatabase(seed = false): Db {
  const db = new Database(":memory:");
  configureDatabase(db);
  runMigrations(db);
  if (seed) {
    seedDatabase(db);
  }
  return db;
}

export function runMigrations(db: Db, migrationsDir = resolveBackendPath("migrations")): void {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
  const applied = new Set(
    (db.prepare("SELECT id FROM schema_migrations").all() as MigrationRow[]).map((row) => row.id)
  );
  const files = readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();
  const apply = db.transaction((file: string) => {
    const sql = readFileSync(path.join(migrationsDir, file), "utf8");
    db.exec(sql);
    db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(file, new Date().toISOString());
  });
  for (const file of files) {
    if (!applied.has(file)) {
      apply(file);
    }
  }
}

export function resetDatabase(db: Db): void {
  db.exec(`
    DELETE FROM fines;
    DELETE FROM reservations;
    DELETE FROM loans;
    DELETE FROM members;
    DELETE FROM books;
  `);
}

export function seedDatabase(db: Db): void {
  const count = db.prepare("SELECT COUNT(*) AS count FROM books").get() as CountRow;
  if (count.count > 0) {
    return;
  }
  const now = new Date().toISOString();
  const books = [
    ["Dune", "Frank Herbert", "9780441172719", 3],
    ["Beloved", "Toni Morrison", "9781400033416", 2],
    ["Kindred", "Octavia E. Butler", "9780807083697", 2],
    ["The Left Hand of Darkness", "Ursula K. Le Guin", "9780441478125", 1],
    ["Parable of the Sower", "Octavia E. Butler", "9780446675505", 2],
    ["The Hobbit", "J. R. R. Tolkien", "9780547928227", 4],
    ["A Wizard of Earthsea", "Ursula K. Le Guin", "9780547773742", 2],
    ["The Fifth Season", "N. K. Jemisin", "9780316229296", 2],
    ["Station Eleven", "Emily St. John Mandel", "9780804172448", 1],
    ["The Dispossessed", "Ursula K. Le Guin", "9780061054884", 2]
  ];
  const members = [
    ["Alice Rivera", "alice@example.com"],
    ["Ben Carter", "ben@example.com"],
    ["Chen Wu", "chen@example.com"],
    ["Deepa Singh", "deepa@example.com"],
    ["Evelyn Brooks", "evelyn@example.com"]
  ];
  const insertBook = db.prepare(
    "INSERT INTO books (id, title, author, isbn, isbn_digits, total_copies) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const insertMember = db.prepare(
    "INSERT INTO members (id, name, email, email_normalized, member_since, status) VALUES (?, ?, ?, ?, ?, 'active')"
  );
  db.transaction(() => {
    for (const [title, author, isbn, copies] of books) {
      insertBook.run(randomUUID(), title, author, isbn, String(isbn).replaceAll("-", ""), copies);
    }
    for (const [name, email] of members) {
      insertMember.run(randomUUID(), name, email, String(email).toLowerCase(), now);
    }
  })();
}
