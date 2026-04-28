import { test, expect } from '@playwright/test';

test.describe('Catalog', () => {
  test('AC-1.1: GET /api/books returns list of books', async ({ request }) => {
    const response = await request.get('/api/books');
    expect(response.ok()).toBeTruthy();
    
    const books = await response.json();
    expect(Array.isArray(books)).toBeTruthy();
    
    if (books.length > 0) {
      expect(books[0]).toHaveProperty('title');
      expect(books[0]).toHaveProperty('author');
      expect(books[0]).toHaveProperty('isbn');
      expect(books[0]).toHaveProperty('total_copies');
      expect(books[0]).toHaveProperty('available_copies');
    }
  });

  test('AC-1.2: GET /api/books/:id returns book with queue depth', async ({ request }) => {
    // First get a book ID
    const booksResponse = await request.get('/api/books');
    const books = await booksResponse.json();
    
    if (books.length === 0) {
      test.skip();
      return;
    }
    
    const response = await request.get(`/api/books/${books[0].id}`);
    expect(response.ok()).toBeTruthy();
    
    const book = await response.json();
    expect(book).toHaveProperty('queue_depth');
  });

  test('AC-1.4: GET /api/books/:id for non-existent returns 404', async ({ request }) => {
    const response = await request.get('/api/books/non-existent-id');
    expect(response.status()).toBe(404);
    
    const body = await response.json();
    expect(body.error).toBe('Book not found');
  });
});

test.describe('Books', () => {
  test('AC-2.1: POST /api/books creates a book', async ({ request }) => {
    const isbn = `test-${Date.now()}`;
    const response = await request.post('/api/books', {
      data: {
        title: 'Test Book',
        author: 'Test Author',
        isbn: isbn,
        total_copies: 3
      }
    });
    
    expect(response.status()).toBe(201);
    
    const book = await response.json();
    expect(book.title).toBe('Test Book');
    expect(book.available_copies).toBe(3);
  });

  test('AC-2.2: POST /api/books with duplicate ISBN returns 409', async ({ request }) => {
    const isbn = `duplicate-${Date.now()}`;
    
    // Create first book
    await request.post('/api/books', {
      data: {
        title: 'Book 1',
        author: 'Author',
        isbn: isbn,
        total_copies: 1
      }
    });
    
    // Try to create second with same ISBN
    const response = await request.post('/api/books', {
      data: {
        title: 'Book 2',
        author: 'Author',
        isbn: isbn,
        total_copies: 1
      }
    });
    
    expect(response.status()).toBe(409);
    const body = await response.json();
    expect(body.error).toBe('ISBN already exists');
  });
});

test.describe('Members', () => {
  test('AC-2.3: POST /api/members creates a member', async ({ request }) => {
    const email = `test-${Date.now()}@example.com`;
    const response = await request.post('/api/members', {
      data: {
        name: 'Test Member',
        email: email
      }
    });
    
    expect(response.status()).toBe(201);
    
    const member = await response.json();
    expect(member.name).toBe('Test Member');
    expect(member.status).toBe('active');
  });

  test('AC-2.4: POST /api/members with duplicate email returns 409', async ({ request }) => {
    const email = `dup-${Date.now()}@example.com`;
    
    // Create first member
    await request.post('/api/members', {
      data: {
        name: 'Member 1',
        email: email
      }
    });
    
    // Try to create second with same email
    const response = await request.post('/api/members', {
      data: {
        name: 'Member 2',
        email: email
      }
    });
    
    expect(response.status()).toBe(409);
  });

  test('AC-6.1: GET /api/members/:id includes unpaid_fines_cents', async ({ request }) => {
    const membersResponse = await request.get('/api/members');
    const members = await membersResponse.json();
    
    if (members.length === 0) {
      test.skip();
      return;
    }
    
    const response = await request.get(`/api/members/${members[0].id}`);
    expect(response.ok()).toBeTruthy();
    
    const member = await response.json();
    expect(member).toHaveProperty('unpaid_fines_cents');
    expect(member).toHaveProperty('active_loans');
  });
});
