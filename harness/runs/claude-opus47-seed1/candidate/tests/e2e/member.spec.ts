import { test, expect } from '@playwright/test';
import {
  backdateLoan,
  borrow,
  createBook,
  createMember,
  resetState,
  reserve,
} from './helpers';

test.beforeEach(async () => {
  await resetState();
});

test('AC-4.5: member profile shows active loans, reservations, and fines', async ({ page }) => {
  const member = await createMember({ name: 'Profile Demo' });
  const lent = await createBook({ title: 'Active Loan Book' });
  const overdueBook = await createBook({ title: 'Overdue Book' });
  const queuedBook = await createBook({ title: 'Reserved Book' });
  const otherMember = await createMember({ name: 'Other Holder' });

  // Loan one book and let it sit
  await borrow(member.id, lent.id);

  // Generate a fine via overdue return
  const overdueLoan = await borrow(member.id, overdueBook.id);
  await backdateLoan(overdueLoan.id, 20);
  await fetch(`http://localhost:3001/api/loans/${overdueLoan.id}/return`, { method: 'POST' });

  // Put the queuedBook on loan with otherMember and reserve it
  await borrow(otherMember.id, queuedBook.id);
  await reserve(member.id, queuedBook.id);

  await page.goto(`/members/${member.id}`);
  await expect(page.getByRole('heading', { name: 'Profile Demo' })).toBeVisible();
  await expect(page.getByText('Active Loan Book')).toBeVisible();
  await expect(page.getByText('Reserved Book')).toBeVisible();
  await expect(page.getByText('Unpaid fines')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pay' }).first()).toBeVisible();
});

test('AC-6.4: pay-fine modal opens, confirms, and clears the fine', async ({ page }) => {
  const member = await createMember({ name: 'Fine Payer' });
  const book = await createBook({ title: 'Late Book' });
  const loan = await borrow(member.id, book.id);
  await backdateLoan(loan.id, 25);
  await fetch(`http://localhost:3001/api/loans/${loan.id}/return`, { method: 'POST' });

  await page.goto(`/members/${member.id}`);
  await page.getByRole('button', { name: 'Pay' }).first().click();
  await expect(page.getByRole('dialog', { name: 'Confirm payment' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm payment' }).click();
  await expect(page.getByText('No outstanding fines')).toBeVisible();
});
