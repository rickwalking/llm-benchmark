import { Given, When, Then, BeforeAll, AfterAll, Before } from '@cucumber/cucumber';
import { request, APIRequestContext, APIResponse } from '@playwright/test';
import { expect } from '@playwright/test';
import Database from 'better-sqlite3';
import { join } from 'path';

let apiContext: APIRequestContext;
let lastResponse: APIResponse;
let lastResponseBody: unknown;
const testDbPath = join(process.cwd(), 'backend/data/test-library.db');

BeforeAll(async () => {
  // Use a test database
  process.env.DB_PATH = testDbPath;
  
  // Start the backend in test mode or connect to running instance
  apiContext = await request.newContext({
    baseURL: 'http://localhost:3001'
  });
});

AfterAll(async () => {
  await apiContext.dispose();
});

Before(async () => {
  // Reset database state before each scenario
  const db = new Database(testDbPath);
  db.exec(`
    DELETE FROM fines;
    DELETE FROM reservations;
    DELETE FROM loans;
    DELETE FROM members WHERE id NOT LIKE 'seed-%';
    DELETE FROM books WHERE id NOT LIKE 'seed-%';
  `);
  db.close();
});

Given('the library has books in the catalog', async () => {
  // Seed data should be present
  const response = await apiContext.get('/api/books');
  expect(response.ok()).toBeTruthy();
});

Given('the library system is operational', async () => {
  const response = await apiContext.get('/health');
  expect(response.ok()).toBeTruthy();
});

Given('the library has books and members', async () => {
  const booksResponse = await apiContext.get('/api/books');
  const membersResponse = await apiContext.get('/api/members');
  expect(booksResponse.ok()).toBeTruthy();
  expect(membersResponse.ok()).toBeTruthy();
});

Given('a book exists with ISBN {string}', async (isbn: string) => {
  const response = await apiContext.post('/api/books', {
    data: {
      title: 'Test Book',
      author: 'Test Author',
      isbn: isbn,
      total_copies: 1
    }
  });
  expect(response.status()).toBe(201);
});

Given('a member exists with email {string}', async (email: string) => {
  const response = await apiContext.post('/api/members', {
    data: {
      name: 'Test Member',
      email: email
    }
  });
  expect(response.status()).toBe(201);
});

When('the librarian requests the book catalog', async () => {
  lastResponse = await apiContext.get('/api/books');
  lastResponseBody = await lastResponse.json();
});

When('the librarian views a specific book', async () => {
  // First get a book ID
  const booksResponse = await apiContext.get('/api/books');
  const books = await booksResponse.json() as Array<{ id: string }>;
  if (books.length > 0) {
    lastResponse = await apiContext.get(`/api/books/${books[0].id}`);
    lastResponseBody = await lastResponse.json();
  }
});

When('the librarian requests a book that does not exist', async () => {
  lastResponse = await apiContext.get('/api/books/non-existent-id');
  lastResponseBody = await lastResponse.json();
});

When('the librarian adds a book with title {string}, author {string}, ISBN {string}, and {int} copies', 
  async (title: string, author: string, isbn: string, copies: number) => {
    lastResponse = await apiContext.post('/api/books', {
      data: { title, author, isbn, total_copies: copies }
    });
    lastResponseBody = await lastResponse.json();
  }
);

When('the librarian adds a book with the same ISBN', async () => {
  lastResponse = await apiContext.post('/api/books', {
    data: { title: 'Duplicate', author: 'Author', isbn: '978-0441013593', total_copies: 1 }
  });
  lastResponseBody = await lastResponse.json();
});

When('the librarian adds a member with name {string} and email {string}', 
  async (name: string, email: string) => {
    lastResponse = await apiContext.post('/api/members', {
      data: { name, email }
    });
    lastResponseBody = await lastResponse.json();
  }
);

When('the librarian adds a member with the same email', async () => {
  lastResponse = await apiContext.post('/api/members', {
    data: { name: 'Another', email: 'john@example.com' }
  });
  lastResponseBody = await lastResponse.json();
});

Then('the system returns a list of all books', async () => {
  expect(Array.isArray(lastResponseBody)).toBeTruthy();
});

Then('each book shows title, author, ISBN, total copies, and available copies', async () => {
  const books = lastResponseBody as Array<Record<string, unknown>>;
  if (books.length > 0) {
    expect(books[0]).toHaveProperty('title');
    expect(books[0]).toHaveProperty('author');
    expect(books[0]).toHaveProperty('isbn');
    expect(books[0]).toHaveProperty('total_copies');
    expect(books[0]).toHaveProperty('available_copies');
  }
});

Then('the list is sorted by title', async () => {
  const books = lastResponseBody as Array<{ title: string }>;
  if (books.length > 1) {
    const titles = books.map(b => b.title.toLowerCase());
    const sorted = [...titles].sort();
    expect(titles).toEqual(sorted);
  }
});

Then('the system returns the book details', async () => {
  expect(lastResponse.ok()).toBeTruthy();
  expect(lastResponseBody).toHaveProperty('id');
  expect(lastResponseBody).toHaveProperty('title');
});

Then('includes the current reservation queue depth', async () => {
  expect(lastResponseBody).toHaveProperty('queue_depth');
});

Then('the system returns a {int} error', async (statusCode: number) => {
  expect(lastResponse.status()).toBe(statusCode);
});

Then('the error message is {string}', async (message: string) => {
  const body = lastResponseBody as { error: string };
  expect(body.error).toBe(message);
});

Then('the system creates the book', async () => {
  expect(lastResponse.status()).toBe(201);
});

Then('returns the created book with a generated ID', async () => {
  expect(lastResponseBody).toHaveProperty('id');
  expect(typeof (lastResponseBody as { id: string }).id).toBe('string');
});

Then('the system creates the member', async () => {
  expect(lastResponse.status()).toBe(201);
});

Then('the member status is {string}', async (status: string) => {
  expect((lastResponseBody as { status: string }).status).toBe(status);
});
