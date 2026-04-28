import { test, expect } from '@playwright/test';

test.describe('US-1: View catalog', () => {
  test('AC-1.1: GET /api/books returns sorted list', async ({ request }) => {
    const res = await request.get('/api/books');
    expect(res.ok()).toBeTruthy();
    const books = await res.json();
    expect(books.length).toBeGreaterThan(0);
    for (let i = 1; i < books.length; i++) {
      expect(books[i - 1].title.toLowerCase() <= books[i].title.toLowerCase()).toBeTruthy();
    }
    for (const book of books) {
      expect(book).toHaveProperty('title');
      expect(book).toHaveProperty('author');
      expect(book).toHaveProperty('isbn');
      expect(book).toHaveProperty('total_copies');
      expect(book).toHaveProperty('available_copies');
    }
  });

  test('AC-1.2: GET /api/books/:id includes reservation_queue_depth', async ({ request }) => {
    const books = await (await request.get('/api/books')).json();
    const bookId = books[0].id;
    const res = await request.get(`/api/books/${bookId}`);
    expect(res.ok()).toBeTruthy();
    const book = await res.json();
    expect(book).toHaveProperty('reservation_queue_depth');
  });

  test('AC-1.4: GET /api/books/:id with non-existent ID returns 404', async ({ request }) => {
    const res = await request.get('/api/books/00000000-0000-0000-0000-000000000000');
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Book not found');
  });

  test('AC-1.3: UI /books page lists books with availability', async ({ page }) => {
    await page.goto('/books');
    await page.waitForSelector('[class*="card"]');
    const cards = page.locator('[class*="card"]');
    expect(await cards.count()).toBeGreaterThan(0);
    const firstCard = cards.first();
    await expect(firstCard).toContainText(/available|on loan/);
  });
});