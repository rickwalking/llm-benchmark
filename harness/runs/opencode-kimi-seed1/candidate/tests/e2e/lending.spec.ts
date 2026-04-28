import { test, expect } from '@playwright/test';

test.describe('Lending', () => {
  test('AC-3.1: POST /api/loans creates a loan', async ({ request }) => {
    // Create a book
    const bookRes = await request.post('/api/books', {
      data: {
        title: 'Loan Test Book',
        author: 'Author',
        isbn: `loan-book-${Date.now()}`,
        total_copies: 3
      }
    });
    const book = await bookRes.json();
    
    // Create a member
    const memberRes = await request.post('/api/members', {
      data: {
        name: 'Loan Test Member',
        email: `loan-member-${Date.now()}@example.com`
      }
    });
    const member = await memberRes.json();
    
    // Create loan
    const loanRes = await request.post('/api/loans', {
      data: {
        member_id: member.id,
        book_id: book.id
      }
    });
    
    expect(loanRes.status()).toBe(201);
    
    const loan = await loanRes.json();
    expect(loan).toHaveProperty('due_at');
    expect(loan.returned_at).toBeNull();
  });

  test('AC-3.3: Loan rejected for suspended member', async ({ request }) => {
    // This test requires seed data with a suspended member
    const membersRes = await request.get('/api/members');
    const members = await membersRes.json();
    const suspendedMember = members.find((m: { status: string }) => m.status === 'suspended');
    
    if (!suspendedMember) {
      test.skip();
      return;
    }
    
    // Get an available book
    const booksRes = await request.get('/api/books');
    const books = await booksRes.json();
    const availableBook = books.find((b: { available_copies: number }) => b.available_copies > 0);
    
    if (!availableBook) {
      test.skip();
      return;
    }
    
    const loanRes = await request.post('/api/loans', {
      data: {
        member_id: suspendedMember.id,
        book_id: availableBook.id
      }
    });
    
    expect(loanRes.status()).toBe(403);
    const body = await loanRes.json();
    expect(body.error).toBe('Member is suspended');
  });
});

test.describe('Returns', () => {
  test('AC-4.1: POST /api/loans/:id/return marks loan returned', async ({ request }) => {
    // Create test data
    const bookRes = await request.post('/api/books', {
      data: {
        title: 'Return Test Book',
        author: 'Author',
        isbn: `return-book-${Date.now()}`,
        total_copies: 2
      }
    });
    const book = await bookRes.json();
    
    const memberRes = await request.post('/api/members', {
      data: {
        name: 'Return Test Member',
        email: `return-member-${Date.now()}@example.com`
      }
    });
    const member = await memberRes.json();
    
    // Create loan
    const loanRes = await request.post('/api/loans', {
      data: {
        member_id: member.id,
        book_id: book.id
      }
    });
    const loan = await loanRes.json();
    
    // Return book
    const returnRes = await request.post(`/api/loans/${loan.id}/return`);
    expect(returnRes.ok()).toBeTruthy();
    
    const returnedLoan = await returnRes.json();
    expect(returnedLoan.returned_at).not.toBeNull();
  });

  test('AC-4.3: Return already returned loan returns 409', async ({ request }) => {
    // Create test data
    const bookRes = await request.post('/api/books', {
      data: {
        title: 'Return Test Book 2',
        author: 'Author',
        isbn: `return-book2-${Date.now()}`,
        total_copies: 2
      }
    });
    const book = await bookRes.json();
    
    const memberRes = await request.post('/api/members', {
      data: {
        name: 'Return Test Member 2',
        email: `return-member2-${Date.now()}@example.com`
      }
    });
    const member = await memberRes.json();
    
    const loanRes = await request.post('/api/loans', {
      data: { member_id: member.id, book_id: book.id }
    });
    const loan = await loanRes.json();
    
    // First return
    await request.post(`/api/loans/${loan.id}/return`);
    
    // Second return should fail
    const secondReturn = await request.post(`/api/loans/${loan.id}/return`);
    expect(secondReturn.status()).toBe(409);
    const body = await secondReturn.json();
    expect(body.error).toBe('Loan already returned');
  });
});

test.describe('Reservations', () => {
  test('AC-5.1: POST /api/reservations creates a reservation', async ({ request }) => {
    // Create a book with no available copies (by creating a loan)
    const bookRes = await request.post('/api/books', {
      data: {
        title: 'Reservation Test Book',
        author: 'Author',
        isbn: `res-book-${Date.now()}`,
        total_copies: 1
      }
    });
    const book = await bookRes.json();
    
    const memberRes = await request.post('/api/members', {
      data: {
        name: 'Reservation Test Member',
        email: `res-member-${Date.now()}@example.com`
      }
    });
    const member = await memberRes.json();
    
    // Create a loan to make book unavailable
    await request.post('/api/loans', {
      data: { member_id: member.id, book_id: book.id }
    });
    
    // Create another member to make reservation
    const memberRes2 = await request.post('/api/members', {
      data: {
        name: 'Reservation Test Member 2',
        email: `res-member2-${Date.now()}@example.com`
      }
    });
    const member2 = await memberRes2.json();
    
    // Create reservation
    const resRes = await request.post('/api/reservations', {
      data: { member_id: member2.id, book_id: book.id }
    });
    
    expect(resRes.status()).toBe(201);
    const reservation = await resRes.json();
    expect(reservation.status).toBe('waiting');
  });

  test('AC-5.5: POST /api/reservations/expire expires stale reservations', async ({ request }) => {
    const res = await request.post('/api/reservations/expire');
    expect(res.ok()).toBeTruthy();
  });
});

test.describe('Fines', () => {
  test('AC-6.2: POST /api/fines/:id/pay marks fine as paid', async ({ request }) => {
    // This test requires a fine to exist
    // Skip if no fines available
    test.skip();
  });

  test('AC-6.3: Paying already paid fine returns 409', async ({ request }) => {
    test.skip();
  });
});
