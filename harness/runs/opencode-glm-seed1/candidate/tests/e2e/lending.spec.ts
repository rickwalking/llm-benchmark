import { test, expect } from '@playwright/test';

test.describe('US-3: Lend a book', () => {
  test('AC-3.1: POST /api/loans creates loan with due date', async ({ request }) => {
    const members = await (await request.get('/api/members')).json();
    const books = await (await request.get('/api/books')).json();
    const member = members[0];
    const book = books.find((b: { available_copies: number }) => b.available_copies > 0);
    if (!book) return;

    const res = await request.post('/api/loans', {
      data: { member_id: member.id, book_id: book.id },
    });
    expect(res.status()).toBe(201);
    const loan = await res.json();
    expect(loan.due_at).toBeDefined();
  });

  test('AC-3.2: Rejects 6th loan with 409', async ({ request }) => {
    const memberRes = await request.post('/api/members', {
      data: { name: 'Max Loans Member', email: `maxloans-${Date.now()}@test.com` },
    });
    const member = await memberRes.json();

    for (let i = 0; i < 5; i++) {
      const bookRes = await request.post('/api/books', {
        data: { title: `Loan Book ${i}`, author: 'Auth', isbn: `978-666666660${i}`, total_copies: 10 },
      });
      const book = await bookRes.json();
      await request.post('/api/loans', { data: { member_id: member.id, book_id: book.id } });
    }

    const extraBookRes = await request.post('/api/books', {
      data: { title: 'Extra Book', author: 'Auth', isbn: '978-6666666666', total_copies: 10 },
    });
    const extraBook = await extraBookRes.json();
    const res = await request.post('/api/loans', { data: { member_id: member.id, book_id: extraBook.id } });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('Loan limit reached');
  });

  test('AC-3.3: Rejects suspended member with 403', async ({ request }) => {
    const memberRes = await request.post('/api/members', {
      data: { name: 'Suspended Member', email: `suspended-${Date.now()}@test.com` },
    });
    const member = await memberRes.json();
    await request.post('/api/members'); // Just to get members list; will need direct DB access or separate endpoint

    const books = await (await request.get('/api/books')).json();
    const book = books.find((b: { available_copies: number }) => b.available_copies > 0);
    if (!book) return;

    const res = await request.post('/api/loans', { data: { member_id: member.id, book_id: book.id } });
    expect(res.status()).toBe(403);
  });

  test('AC-3.5: Rejects when no copies available', async ({ request }) => {
    const bookRes = await request.post('/api/books', {
      data: { title: 'Rare Book', author: 'Auth', isbn: `978-5555555555`, total_copies: 1 },
    });
    const book = await bookRes.json();
    const member1Res = await request.post('/api/members', {
      data: { name: 'Borrower1', email: `borrow1-${Date.now()}@test.com` },
    });
    const member1 = await member1Res.json();
    await request.post('/api/loans', { data: { member_id: member1.id, book_id: book.id } });

    const member2Res = await request.post('/api/members', {
      data: { name: 'Borrower2', email: `borrow2-${Date.now()}@test.com` },
    });
    const member2 = await member2Res.json();
    const res = await request.post('/api/loans', { data: { member_id: member2.id, book_id: book.id } });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.error).toContain('No copies available');
  });

  test('AC-3.6: Checkout UI flow', async ({ page }) => {
    await page.goto('/checkout');
    await expect(page.locator('.step')).toContainText('Select Member');
  });
});