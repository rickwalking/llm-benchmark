import Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';

export function seed(db: Database.Database): void {
  const memberCount = db.prepare('SELECT COUNT(*) as count FROM members').get() as { count: number };
  if (memberCount.count > 0) return;

  const insertBook = db.prepare(
    'INSERT INTO books (id, title, author, isbn, total_copies) VALUES (?, ?, ?, ?, ?)'
  );
  const insertMember = db.prepare(
    'INSERT INTO members (id, name, email, member_since, status) VALUES (?, ?, ?, ?, ?)'
  );

  const books = [
    { title: '1984', author: 'George Orwell', isbn: '978-0-452-28423-4', copies: 3 },
    { title: 'A Gentleman in Moscow', author: 'Amor Towles', isbn: '978-0-14-311044-0', copies: 2 },
    { title: 'Brave New World', author: 'Aldous Huxley', isbn: '978-0-06-085052-4', copies: 4 },
    { title: 'Dune', author: 'Frank Herbert', isbn: '978-0-441-17271-9', copies: 3 },
    { title: 'Fahrenheit 451', author: 'Ray Bradbury', isbn: '978-1-4516-7331-0', copies: 2 },
    { title: 'Good Omens', author: 'Neil Gaiman & Terry Pratchett', isbn: '978-0-06-085398-3', copies: 3 },
    { title: 'Harry Potter and the Sorcerer\'s Stone', author: 'J.K. Rowling', isbn: '978-0-590-35340-3', copies: 5 },
    { title: 'Jurassic Park', author: 'Michael Crichton', isbn: '978-0-345-37179-3', copies: 2 },
    { title: 'Little Women', author: 'Louisa May Alcott', isbn: '978-0-14-751394-8', copies: 3 },
    { title: 'The Alchemist', author: 'Paulo Coelho', isbn: '978-0-06-112241-5', copies: 2 },
  ];

  const members = [
    { name: 'Alice Johnson', email: 'alice@example.com' },
    { name: 'Bob Smith', email: 'bob@example.com' },
    { name: 'Carol Davis', email: 'carol@example.com' },
    { name: 'David Wilson', email: 'david@example.com' },
    { name: 'Eve Martinez', email: 'eve@example.com' },
  ];

  for (const book of books) {
    insertBook.run(uuid(), book.title, book.author, book.isbn, book.copies);
  }

  for (const member of members) {
    insertMember.run(uuid(), member.name, member.email, '2024-01-01', 'active');
  }
}