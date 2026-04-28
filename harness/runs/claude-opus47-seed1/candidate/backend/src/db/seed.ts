import type { Database } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

type DB = Database;

interface SeedBook {
  title: string;
  author: string;
  isbn: string;
  total_copies: number;
}

interface SeedMember {
  name: string;
  email: string;
}

const SEED_BOOKS: SeedBook[] = [
  { title: 'Dune', author: 'Frank Herbert', isbn: '978-0-441-17271-9', total_copies: 3 },
  { title: 'The Left Hand of Darkness', author: 'Ursula K. Le Guin', isbn: '978-0-441-47812-5', total_copies: 2 },
  { title: 'Foundation', author: 'Isaac Asimov', isbn: '978-0-553-29335-0', total_copies: 4 },
  { title: 'Neuromancer', author: 'William Gibson', isbn: '978-0-441-56956-4', total_copies: 2 },
  { title: 'Snow Crash', author: 'Neal Stephenson', isbn: '978-0-553-38095-8', total_copies: 3 },
  { title: 'The Dispossessed', author: 'Ursula K. Le Guin', isbn: '978-0-06-051275-9', total_copies: 2 },
  { title: 'Hyperion', author: 'Dan Simmons', isbn: '978-0-553-28368-9', total_copies: 2 },
  { title: 'A Wizard of Earthsea', author: 'Ursula K. Le Guin', isbn: '978-0-547-72202-3', total_copies: 3 },
  { title: 'The Stars My Destination', author: 'Alfred Bester', isbn: '978-0-679-76780-7', total_copies: 1 },
  { title: 'Ringworld', author: 'Larry Niven', isbn: '978-0-345-33392-6', total_copies: 2 },
];

const SEED_MEMBERS: SeedMember[] = [
  { name: 'Alice Johnson', email: 'alice@example.com' },
  { name: 'Bob Smith', email: 'bob@example.com' },
  { name: 'Charlie Davis', email: 'charlie@example.com' },
  { name: 'Dana Lee', email: 'dana@example.com' },
  { name: 'Erin Quinn', email: 'erin@example.com' },
];

export function seedIfEmpty(db: DB): void {
  const bookCount = (db.prepare('SELECT COUNT(*) AS n FROM books').get() as { n: number }).n;
  const memberCount = (db.prepare('SELECT COUNT(*) AS n FROM members').get() as { n: number }).n;

  if (bookCount > 0 || memberCount > 0) {
    return;
  }

  const insertBook = db.prepare(
    'INSERT INTO books (id, title, author, isbn, total_copies) VALUES (?, ?, ?, ?, ?)',
  );
  const insertMember = db.prepare(
    "INSERT INTO members (id, name, email, member_since, status) VALUES (?, ?, ?, date('now'), 'active')",
  );

  const tx = db.transaction(() => {
    for (const b of SEED_BOOKS) {
      insertBook.run(uuidv4(), b.title, b.author, b.isbn, b.total_copies);
    }
    for (const m of SEED_MEMBERS) {
      insertMember.run(uuidv4(), m.name, m.email);
    }
  });
  tx();
}
