import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || join(__dirname, '../../data/library.db');

export function getDatabase(): Database.Database {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

export function runMigrations(db: Database.Database): void {
  const migrationsDir = join(__dirname, '../../migrations');
  const files = readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  // Check if migrations table exists
  const tableCheck = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name='migrations'
  `);
  const hasMigrationsTable = !!tableCheck.get();

  let applied = new Set<string>();
  if (hasMigrationsTable) {
    const getApplied = db.prepare('SELECT filename FROM migrations');
    const rows = getApplied.all() as Array<{ filename: string }>;
    applied = new Set(rows.map(row => row.filename));
  }

  for (const file of files) {
    if (!applied.has(file)) {
      const sql = readFileSync(join(migrationsDir, file), 'utf-8');
      db.exec(sql);
      console.log(`Applied migration: ${file}`);
    }
  }
}

export function seedData(db: Database.Database): void {
  // Check if we have any books
  const count = db.prepare('SELECT COUNT(*) as count FROM books').get() as { count: number };
  if (count.count > 0) return;

  console.log('Seeding initial data...');

  const insertBook = db.prepare(`
    INSERT INTO books (id, title, author, isbn, total_copies) 
    VALUES (?, ?, ?, ?, ?)
  `);

  const books = [
    ['b1', 'The Great Gatsby', 'F. Scott Fitzgerald', '978-0-7432-7356-5', 3],
    ['b2', 'To Kill a Mockingbird', 'Harper Lee', '978-0-06-112008-4', 2],
    ['b3', '1984', 'George Orwell', '978-0-452-28423-4', 4],
    ['b4', 'Pride and Prejudice', 'Jane Austen', '978-0-14-143951-8', 2],
    ['b5', 'The Catcher in the Rye', 'J.D. Salinger', '978-0-316-76948-0', 3],
    ['b6', 'Lord of the Flies', 'William Golding', '978-0-399-50148-7', 2],
    ['b7', 'The Hobbit', 'J.R.R. Tolkien', '978-0-618-00221-3', 5],
    ['b8', 'Fahrenheit 451', 'Ray Bradbury', '978-0-7432-4722-1', 3],
    ['b9', 'Moby Dick', 'Herman Melville', '978-0-14-243724-7', 2],
    ['b10', 'War and Peace', 'Leo Tolstoy', '978-0-14-044793-4', 2],
  ];

  for (const book of books) {
    insertBook.run(...book);
  }

  const insertMember = db.prepare(`
    INSERT INTO members (id, name, email, member_since, status) 
    VALUES (?, ?, ?, ?, ?)
  `);

  const members = [
    ['m1', 'Alice Johnson', 'alice@example.com', '2023-01-15', 'active'],
    ['m2', 'Bob Smith', 'bob@example.com', '2023-03-22', 'active'],
    ['m3', 'Carol White', 'carol@example.com', '2023-06-10', 'active'],
    ['m4', 'David Brown', 'david@example.com', '2023-08-05', 'suspended'],
    ['m5', 'Emma Davis', 'emma@example.com', '2024-01-20', 'active'],
  ];

  for (const member of members) {
    insertMember.run(...member);
  }

  console.log('Seeding complete');
}

export type DatabaseInstance = Database.Database;
