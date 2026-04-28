import { test, expect } from '@playwright/test';
import { borrow, createBook, createMember, resetState } from './helpers';

test.beforeEach(async () => {
  await resetState();
});

test('AC-3.6: checkout flow lends a book end-to-end', async ({ page }) => {
  const member = await createMember({ name: 'Eve Reader' });
  const book = await createBook({ title: 'Checkout Target' });

  await page.goto('/checkout');
  await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible();

  // Step 1: pick member
  await page.getByLabel(/Eve Reader/).check();
  await page.getByRole('button', { name: 'Next' }).click();

  // Step 2: pick book
  await page.getByLabel(/Checkout Target/).check();
  await page.getByRole('button', { name: 'Next' }).click();

  // Step 3: confirm
  await expect(page.getByText(/Lend/)).toBeVisible();
  await page.getByRole('button', { name: 'Confirm checkout' }).click();
  await expect(page.getByRole('heading', { name: 'Checkout complete' })).toBeVisible();
});

test('AC-3.5 NEG: checkout surfaces server rejection when no copies available', async ({ page }) => {
  const m1 = await createMember({ name: 'First Member' });
  const m2 = await createMember({ name: 'Second Member' });
  const book = await createBook({ title: 'Single Copy', total_copies: 1 });
  await borrow(m1.id, book.id);

  await page.goto('/checkout');
  await page.getByLabel(/Second Member/).check();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel(/Single Copy/).check();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('No copies available').first()).toBeVisible();
  await page.getByRole('button', { name: 'Confirm checkout' }).click();
  await expect(page.getByRole('alert')).toContainText('No copies available');
});

test('AC-3.6: 5th-loan warning is shown on confirm', async ({ page }) => {
  const member = await createMember({ name: 'Frequent Borrower' });
  for (let i = 0; i < 4; i += 1) {
    const b = await createBook({ title: `Filler ${i + 1}` });
    await borrow(member.id, b.id);
  }
  const target = await createBook({ title: 'Fifth' });

  await page.goto('/checkout');
  await page.getByLabel(/Frequent Borrower/).check();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel(/Fifth/).check();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText(/5th and final loan/)).toBeVisible();
});
