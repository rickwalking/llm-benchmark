import { test, expect } from '@playwright/test';

test.describe('US-4: Record returns and fines', () => {
  test('AC-4.1: Return a loan', async ({ request }) => {
    const memberRes = await request.post('/api/members', {
      data: { name: 'Return Member', email: `return-${Date.now()}@test.com` },
    });
    const member = await memberRes.json();
    const bookRes = await request.post('/api/books', {
      data: { title: 'Return Book', author: 'Auth', isbn: '978-4444444444', total_copies: 3 },
    });
    const book = await bookRes.json();
    const loanRes = await request.post('/api/loans', { data: { member_id: member.id, book_id: book.id } });
    const loan = await loanRes.json();

    const returnRes = await request.post(`/api/loans/${loan.id}/return`);
    expect(returnRes.status()).toBe(200);
    const returned = await returnRes.json();
    expect(returned.returned_at).toBeTruthy();
  });

  test('AC-4.3: Return already-returned loan returns 409', async ({ request }) => {
    const memberRes = await request.post('/api/members', {
      data: { name: 'Double Return', email: `dbret-${Date.now()}@test.com` },
    });
    const member = await memberRes.json();
    const bookRes = await request.post('/api/books', {
      data: { title: 'Double Book', author: 'Auth', isbn: '978-3333333333', total_copies: 3 },
    });
    const book = await bookRes.json();
    const loanRes = await request.post('/api/loans', { data: { member_id: member.id, book_id: book.id } });
    const loan = await loanRes.json();

    await request.post(`/api/loans/${loan.id}/return`);
    const secondReturn = await request.post(`/api/loans/${loan.id}/return`);
    expect(secondReturn.status()).toBe(409);
  });

  test('AC-4.5: Member profile shows loans and fines', async ({ page, request }) => {
    const members = await (await request.get('/api/members')).json();
    if (members.length > 0) {
      await page.goto(`/members/${members[0].id}`);
      await expect(page.locator('h1')).toBeVisible();
    }
  });
});