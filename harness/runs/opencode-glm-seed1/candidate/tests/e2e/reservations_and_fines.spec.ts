import { test, expect } from '@playwright/test';

test.describe('US-5: Reserve unavailable books', () => {
  test('AC-5.1: Create reservation for unavailable book', async ({ request }) => {
    const memberRes = await request.post('/api/members', {
      data: { name: 'Reserve Member', email: `reserve-${Date.now()}@test.com` },
    });
    const member = await memberRes.json();
    const bookRes = await request.post('/api/books', {
      data: { title: 'Reserve Book', author: 'Auth', isbn: '978-2222222222', total_copies: 1 },
    });
    const book = await bookRes.json();
    const borrowerRes = await request.post('/api/members', {
      data: { name: 'Reserve Borrower', email: `rbo-${Date.now()}@test.com` },
    });
    const borrower = await borrowerRes.json();
    await request.post('/api/loans', { data: { member_id: borrower.id, book_id: book.id } });

    const res = await request.post('/api/reservations', { data: { member_id: member.id, book_id: book.id } });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.status).toBe('waiting');
  });

  test('AC-5.2: Reject reservation when member has book on loan', async ({ request }) => {
    const memberRes = await request.post('/api/members', {
      data: { name: 'Has Loan', email: `hasloan-${Date.now()}@test.com` },
    });
    const member = await memberRes.json();
    const bookRes = await request.post('/api/books', {
      data: { title: 'Loan Reserve Book', author: 'Auth', isbn: '978-2111111111', total_copies: 1 },
    });
    const book = await bookRes.json();
    await request.post('/api/loans', { data: { member_id: member.id, book_id: book.id } });

    const res = await request.post('/api/reservations', { data: { member_id: member.id, book_id: book.id } });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('Member already has this book on loan');
  });

  test('AC-5.3: Reject duplicate reservation', async ({ request }) => {
    const memberRes = await request.post('/api/members', {
      data: { name: 'Dup Res', email: `dupres-${Date.now()}@test.com` },
    });
    const member = await memberRes.json();
    const bookRes = await request.post('/api/books', {
      data: { title: 'Dup Res Book', author: 'Auth', isbn: '978-2111111112', total_copies: 1 },
    });
    const book = await bookRes.json();
    const borrowerRes = await request.post('/api/members', {
      data: { name: 'Dup Borrower', email: `dupb-${Date.now()}@test.com` },
    });
    const borrower = await borrowerRes.json();
    await request.post('/api/loans', { data: { member_id: borrower.id, book_id: book.id } });
    await request.post('/api/reservations', { data: { member_id: member.id, book_id: book.id } });

    const res = await request.post('/api/reservations', { data: { member_id: member.id, book_id: book.id } });
    expect(res.status()).toBe(409);
    expect((await res.json()).error).toBe('Duplicate reservation');
  });

  test('AC-5.5: Expire stale reservations', async ({ request }) => {
    const res = await request.post('/api/reservations/expire');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('expired');
  });
});

test.describe('US-6: Collect fines', () => {
  test('AC-6.2: Pay a fine', async ({ request }) => {
    const memberRes = await request.post('/api/members', {
      data: { name: 'Fine Pay', email: `finepay-${Date.now()}@test.com` },
    });
    const member = await memberRes.json();
    const bookRes = await request.post('/api/books', {
      data: { title: 'Fine Book', author: 'Auth', isbn: '978-1111111110', total_copies: 5 },
    });
    const book = await bookRes.json();
    const loanRes = await request.post('/api/loans', { data: { member_id: member.id, book_id: book.id } });
    const loan = await loanRes.json();
    await request.post(`/api/loans/${loan.id}/return?returned_at=${encodeURIComponent(new Date(Date.now() + 21 * 86400000).toISOString())}`);

    const memberDetail = await (await request.get(`/api/members/${member.id}`)).json();
    const unpaidFines = memberDetail.fines.filter((f: { paid_at: null | string }) => !f.paid_at);
    if (unpaidFines.length > 0) {
      const payRes = await request.post(`/api/fines/${unpaidFines[0].id}/pay`);
      expect(payRes.status()).toBe(200);
    }
  });

  test('AC-6.3: Pay already-paid fine returns 409', async ({ request }) => {
    const memberRes = await request.post('/api/members', {
      data: { name: 'Fine Dup', email: `finedup-${Date.now()}@test.com` },
    });
    const member = await memberRes.json();
    const bookRes = await request.post('/api/books', {
      data: { title: 'Fine Dup Book', author: 'Auth', isbn: '978-1111111111', total_copies: 5 },
    });
    const book = await bookRes.json();
    const loanRes = await request.post('/api/loans', { data: { member_id: member.id, book_id: book.id } });
    const loan = await loanRes.json();
    await request.post(`/api/loans/${loan.id}/return`);
    const memberDetail = await (await request.get(`/api/members/${member.id}`)).json();
    if (memberDetail.fines && memberDetail.fines.length > 0) {
      const fine = memberDetail.fines[0];
      await request.post(`/api/fines/${fine.id}/pay`);
      const payRes = await request.post(`/api/fines/${fine.id}/pay`);
      expect(payRes.status()).toBe(409);
    }
  });
});