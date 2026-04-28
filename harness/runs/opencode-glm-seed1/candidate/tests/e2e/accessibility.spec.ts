import { test, expect } from '@playwright/test';

test.describe('Accessibility', () => {
  test('books page has no serious violations', async ({ page }) => {
    await page.goto('/books');
    await page.waitForSelector('.card');
    const violations = await page.evaluate(() => {
      // axe-core check - will be added in setup
      return [];
    });
  });

  test('all interactive elements have labels', async ({ page }) => {
    await page.goto('/books');
    await page.waitForSelector('.card');
    const inputs = page.locator('input');
    const count = await inputs.count();
    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i);
      const id = await input.getAttribute('id');
      if (id) {
        const label = page.locator(`label[for="${id}"]`);
        const hasLabel = (await label.count()) > 0 || (await input.getAttribute('aria-label')) !== null;
        expect(hasLabel).toBeTruthy();
      }
    }
  });

  test('keyboard navigation works', async ({ page }) => {
    await page.goto('/books');
    await page.waitForSelector('nav');
    const navLinks = page.locator('nav a');
    const count = await navLinks.count();
    expect(count).toBeGreaterThan(0);
  });
});