import { test, expect } from '@playwright/test';
import { borrow, createBook, createMember, resetState } from './helpers';

test.beforeEach(async () => {
  await resetState();
});

test('AC-5.6: book detail shows queue position for the selected member', async ({ page }) => {
  const m1 = await createMember({ name: 'Holder' });
  const m2 = await createMember({ name: 'Reserver' });
  const book = await createBook({ title: 'Queue Position Demo', total_copies: 1 });
  await borrow(m1.id, book.id);

  await page.goto(`/books/${book.id}?member=${m2.id}`);
  await expect(page.getByLabel('Acting as member')).toHaveValue(m2.id);

  await page.getByRole('button', { name: 'Reserve' }).click();
  await expect(page.getByTestId('reservation-status')).toContainText(/queue/);
});

test('AC-2.1: add-book modal creates a book and updates the catalog', async ({ page }) => {
  await page.goto('/books');
  await page.getByRole('button', { name: 'Add book' }).click();
  await expect(page.getByRole('dialog', { name: 'Add a book' })).toBeVisible();
  await page.getByLabel('Title').fill('Brand New Title');
  await page.getByLabel('Author').fill('A. Newcomer');
  await page.getByLabel('ISBN').fill('978-0-123-45678-9');
  await page.getByLabel('Total copies').fill('2');
  await page.getByRole('button', { name: 'Add book', exact: true }).last().click();
  await expect(page.getByText('Brand New Title')).toBeVisible();
});

test('AC-2.4 NEG: duplicate email shows an error message in the modal', async ({ page }) => {
  await createMember({ email: 'taken@example.com', name: 'Existing' });

  await page.goto('/members');
  await page.getByRole('button', { name: 'Add member' }).click();
  await page.getByLabel('Name').fill('Another');
  await page.getByLabel('Email').fill('taken@example.com');
  await page.getByRole('button', { name: 'Add member', exact: true }).last().click();
  await expect(page.getByRole('alert')).toContainText('Email already exists');
});
