import { test, expect } from '@playwright/test';

test.describe('US-2: Add books and members', () => {
  test('AC-2.1: POST /api/books creates a book and returns 201', async ({ request }) => {
    const res = await request.post('/api/books', {
      data: { title: 'E2E Test Book', author: 'E2E Author', isbn: '978-9999999999', total_copies: 3 },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.title).toBe('E2E Test Book');
  });

  test('AC-2.2: POST /api/books with duplicate ISBN returns 409', async ({ request }) => {
    await request.post('/api/books', {
      data: { title: 'Dup Book', author: 'Auth', isbn: '978-8888888888', total_copies: 1 },
    });
    const res = await request.post('/api/books', {
      data: { title: 'Dup Book 2', author: 'Auth 2', isbn: '978-8888888888', total_copies: 1 },
    });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('ISBN already exists');
  });

  test('AC-2.3: POST /api/members creates a member', async ({ request }) => {
    const res = await request.post('/api/members', {
      data: { name: 'E2E Member', email: `e2e-${Date.now()}@test.com` },
    });
    expect(res.status()).toBe(201);
  });

  test('AC-2.4: POST /api/members with duplicate email returns 409', async ({ request }) => {
    const email = `dup-${Date.now()}@test.com`;
    await request.post('/api/members', { data: { name: 'M1', email } });
    const res = await request.post('/api/members', { data: { name: 'M2', email } });
    expect(res.status()).toBe(409);
  });

  test('AC-2.1 UI: Add book form works', async ({ page }) => {
    await page.goto('/books');
    await page.getByRole('button', { name: 'Add Book' }).click();
    await page.getByLabel('Title').fill('Playwright Book');
    await page.getByLabel('Author').fill('Test Author');
    await page.getByLabel('ISBN').fill('978-7777777777');
    await page.getByLabel('Total Copies').fill('2');
    await page.getByRole('button', { name: 'Create Book' }).click();
    await expect(page.locator('.alert-danger')).not.toBeVisible();
  });
});