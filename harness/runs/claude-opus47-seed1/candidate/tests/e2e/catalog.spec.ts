import { test, expect } from '@playwright/test';
import { createBook, createMember, reserve, borrow, resetState } from './helpers';

test.beforeEach(async () => {
  await resetState();
});

test('AC-1.1: catalog lists books sorted by title', async ({ page }) => {
  await createBook({ title: 'Zebra Tale' });
  await createBook({ title: 'apple primer' });
  await createBook({ title: 'middle ground' });

  await page.goto('/books');
  await expect(page.getByRole('heading', { name: 'Catalog' })).toBeVisible();
  const cards = page.getByTestId('book-card');
  await expect(cards).toHaveCount(3);
  const titles = await cards.locator('.book-card__title').allInnerTexts();
  expect(titles.map((t) => t.toLowerCase())).toEqual([
    'apple primer',
    'middle ground',
    'zebra tale',
  ]);
});

test('AC-1.3: catalog shows availability and waiting count', async ({ page }) => {
  const book = await createBook({ title: 'Sole Copy', total_copies: 1 });
  const m1 = await createMember();
  const m2 = await createMember();
  await borrow(m1.id, book.id);
  await reserve(m2.id, book.id);

  await page.goto('/books');
  const card = page.getByTestId('book-card').filter({ hasText: 'Sole Copy' });
  await expect(card).toContainText('All copies on loan');
});

test('AC-1.4: book detail page renders queue depth', async ({ page }) => {
  const book = await createBook({ title: 'Queue Demo', total_copies: 1 });
  const m1 = await createMember();
  const m2 = await createMember();
  await borrow(m1.id, book.id);
  await reserve(m2.id, book.id);

  await page.goto(`/books/${book.id}`);
  await expect(page.getByTestId('queue-depth')).toContainText('1');
});

test('empty catalog shows an empty state', async ({ page }) => {
  await page.goto('/books');
  await expect(page.getByText('The catalog is empty')).toBeVisible();
});
