import { test, expect, type Page } from '@playwright/test';
import { borrow, createBook, createMember, reserve, resetState } from './helpers';

async function runAxe(page: Page): Promise<{ id: string; impact: string | null }[]> {
  await page.addScriptTag({
    url: 'https://unpkg.com/axe-core@4.10.0/axe.min.js',
  }).catch(async () => {
    // No network - inject from local node_modules instead.
    await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  });
  return await page.evaluate(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = await (window as any).axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    return results.violations.map((v: { id: string; impact: string | null }) => ({
      id: v.id,
      impact: v.impact,
    }));
  });
}

function critical(violations: { id: string; impact: string | null }[]) {
  return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
}

test.beforeEach(async () => {
  await resetState();
});

test('a11y: catalog page has no serious/critical violations', async ({ page }) => {
  await createBook({ title: 'A11y Catalog Item' });
  await page.goto('/books');
  await page.waitForSelector('[data-testid="book-card"]');
  const violations = await runAxe(page);
  expect(critical(violations)).toEqual([]);
});

test('a11y: book detail page passes axe', async ({ page }) => {
  const book = await createBook({ title: 'A11y Detail' });
  await page.goto(`/books/${book.id}`);
  await page.getByRole('heading', { name: 'A11y Detail' }).waitFor();
  const violations = await runAxe(page);
  expect(critical(violations)).toEqual([]);
});

test('a11y: members page passes axe', async ({ page }) => {
  await createMember({ name: 'Visible Member' });
  await page.goto('/members');
  await page.waitForSelector('.member-row');
  const violations = await runAxe(page);
  expect(critical(violations)).toEqual([]);
});

test('a11y: member detail page passes axe', async ({ page }) => {
  const m = await createMember({ name: 'Detail Member' });
  await page.goto(`/members/${m.id}`);
  await page.getByRole('heading', { name: 'Detail Member' }).waitFor();
  const violations = await runAxe(page);
  expect(critical(violations)).toEqual([]);
});

test('a11y: checkout page passes axe', async ({ page }) => {
  await createMember({ name: 'Checkout Subject' });
  await createBook({ title: 'Checkout Available' });
  await page.goto('/checkout');
  await page.getByRole('heading', { name: 'Checkout' }).waitFor();
  const violations = await runAxe(page);
  expect(critical(violations)).toEqual([]);
});

test('a11y: keyboard-only happy path through the catalog', async ({ page }) => {
  const book = await createBook({ title: 'Keyboard Friendly' });
  await page.goto('/books');
  await page.waitForSelector('[data-testid="book-card"]');
  // Tab into the body and ensure we can reach an interactive control on the page.
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  // We should now have keyboard focus somewhere reachable.
  const tag = await page.evaluate(() => document.activeElement?.tagName);
  expect(['A', 'BUTTON', 'INPUT', 'SELECT'].includes(tag ?? '')).toBe(true);
  // Suppress unused warning.
  expect(book.id).toBeTruthy();
});
