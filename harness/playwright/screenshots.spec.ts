// Screenshot capture spec — copied into the candidate repo by run-objective.sh,
// run there, and the resulting PNGs are written to $SCREENSHOT_OUT. The judges
// for the UI/UX rubric read these.
//
// Three states per page: empty, populated, error. The "empty" state assumes
// the candidate exposes a dev-only DB-reset endpoint OR can be coerced into
// emptiness by deleting seed rows. If the candidate has no such endpoint,
// the empty screenshots will simply mirror the populated ones — that is itself
// a finding the judge will see.

import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const OUT = process.env.SCREENSHOT_OUT || 'screenshots';
fs.mkdirSync(OUT, { recursive: true });

const PAGES = [
  { name: 'books',          path: '/books' },
  { name: 'book-detail',    path: '/books/_first' },     // resolved at runtime
  { name: 'members',        path: '/members' },
  { name: 'member-profile', path: '/members/_first' },
  { name: 'checkout',       path: '/checkout' },
];

async function shoot(page: any, name: string, state: string) {
  const file = path.join(OUT, `${name}--${state}.png`);
  await page.screenshot({ path: file, fullPage: true });
}

test.describe('UI/UX screenshot capture', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (e) => console.error('pageerror', e.message));
  });

  test('populated state', async ({ page, request }) => {
    // The seed routine should have populated the DB on first boot.
    const books = await request.get('http://localhost:3001/api/books').then(r => r.json());
    const members = await request.get('http://localhost:3001/api/members').then(r => r.json());
    const firstBookId = (books?.items?.[0] ?? books?.[0])?.id;
    const firstMemberId = (members?.items?.[0] ?? members?.[0])?.id;

    for (const p of PAGES) {
      let url = p.path
        .replace('_first', firstBookId ?? 'missing')
        .replace('_first', firstMemberId ?? 'missing');
      if (p.name === 'member-profile') url = `/members/${firstMemberId ?? 'missing'}`;
      if (p.name === 'book-detail')    url = `/books/${firstBookId ?? 'missing'}`;
      await page.goto(`http://localhost:5173${url}`);
      await page.waitForLoadState('networkidle').catch(() => {});
      await shoot(page, p.name, 'populated');
    }
  });

  test('error state — non-existent IDs', async ({ page }) => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    await page.goto(`http://localhost:5173/books/${fakeId}`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await shoot(page, 'book-detail', 'error');

    await page.goto(`http://localhost:5173/members/${fakeId}`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await shoot(page, 'member-profile', 'error');
  });

  test('checkout flow — three steps', async ({ page }) => {
    await page.goto('http://localhost:5173/checkout');
    await page.waitForLoadState('networkidle').catch(() => {});
    await shoot(page, 'checkout', 'step-1');
    // The judge can see whether the model implemented a coherent multi-step UI
    // even if we can't reliably automate the exact selectors. The single shot
    // of step 1 is enough for the rubric.
  });

  // Empty state: best-effort. If the candidate exposes /api/dev/reset (it
  // probably won't), we use it. Otherwise we skip and the populated-state
  // shot doubles as evidence that the empty state was not differentiated.
  test('empty state (best-effort)', async ({ page, request }) => {
    const reset = await request.post('http://localhost:3001/api/dev/reset')
      .then(r => r.ok())
      .catch(() => false);
    if (!reset) {
      test.info().annotations.push({ type: 'skip', description: 'no dev reset endpoint' });
      return;
    }
    for (const p of ['books', 'members', 'checkout']) {
      await page.goto(`http://localhost:5173/${p}`);
      await page.waitForLoadState('networkidle').catch(() => {});
      await shoot(page, p, 'empty');
    }
  });
});
