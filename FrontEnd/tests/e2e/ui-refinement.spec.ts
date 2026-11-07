import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { signIn } from './support';

test('returning to Overview reuses the result, while Refresh reads current data', async ({ page }) => {
  await signIn(page);
  let reads = 0;
  const headers = { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  await page.route('**/api/modules/master-contract/contracts/query', route => {
    reads++;
    return route.fulfill({ status: 200, headers, body: JSON.stringify({ rows: [], total: 0, page: 1, pageSize: 100 }) });
  });
  await page.route('**/zfs_sb_tsfdeal_o4_api/**', route => route.fulfill({ status: 200, headers, body: JSON.stringify({ value: [] }) }));
  await page.goto('/');
  const figures = page.getByRole('region', { name: 'Key figures', exact: true });
  await expect(figures.locator('article')).toHaveCount(5);
  expect(reads).toBe(1);
  await page.locator('.sidebar a[href="/fx-structure"]').click();
  await expect(figures).toHaveCount(0);
  await page.locator('.sidebar nav a[href="/"]').click();
  await expect(figures.locator('article')).toHaveCount(5);
  expect(reads).toBe(1);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect.poll(() => reads).toBe(2);
  await expect(figures.locator('article')).toHaveCount(5);
});

test('Auto-create Deals keeps amount and other first-row fields aligned in both themes', async ({ page }) => {
  await signIn(page);
  // The dialog reads the middleware masters (fixture of DS4 rows) and the contracts' usage in SAP (none here).
  const masters = JSON.parse(readFileSync(path.resolve('tests/fixtures/fx-masters.json'), 'utf8')) as Record<string, unknown[]>;
  await page.route('**/api/ref/middleware/data/**', route => {
    const resource = new URL(route.request().url()).pathname.split('/').pop() ?? '';
    const rows = masters[resource] ?? [];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, resource, rows, total: rows.length }) });
  });
  await page.route(/TrmFxApp|FxTransaction/, route => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ value: [] }) }));
  await page.goto('/fx-structure/front-office/fx-blotter');
  await page.getByRole('button', { name: 'Auto-create Deals', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Auto-create Deals', exact: true });
  await dialog.getByLabel('Origin Entity').selectOption('OSIPL');
  await dialog.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('dialog', { name: 'View Master Contracts' }).getByRole('cell', { name: '2000000040', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: 'Deal 1 Amount 1', exact: true })).toBeVisible();
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    for (const index of [1, 2]) {
      const group = dialog.locator('.tsf-fields').nth(index);
      const tops = await group.evaluate(group => [...group.children].slice(0, 4).map(field => field.querySelector('input,select')!.getBoundingClientRect().top));
      expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth + 1)).toBe(true);
  const amount = dialog.getByRole('textbox', { name: 'Deal 1 Amount 1', exact: true });
  await amount.scrollIntoViewIfNeeded();
  await amount.fill('2Cr');
  await amount.press('Tab');
  await expect(amount).toHaveValue('20,000,000.00');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
});

test('Master, FO, MO and BO tiles have one fixed 280x120 size and aligned content without overflow', async ({ page }) => {
  await signIn(page);
  for (const folder of ['master-contract', 'front-office', 'mid-office', 'back-office']) {
    await page.goto(`/fx-structure/${folder}`);
    const tiles = page.locator('.tile-grid .tile');
    expect((await tiles.allTextContents()).join(' ')).not.toMatch(/\bZ[A-Z0-9_]{4,}\b/);
    const boxes = await tiles.evaluateAll(tiles => tiles.map(tile => ({ tile: tile.getBoundingClientRect().toJSON(), title: tile.querySelector('.tile-title')!.getBoundingClientRect().toJSON() })));
    expect(boxes.length).toBeGreaterThan(1);
    const first = boxes.filter(box => Math.abs(box.tile.top - boxes[0].tile.top) < 2);
    for (const box of first) {
      expect(Math.round(box.tile.width)).toBe(280);
      expect(Math.round(box.tile.height)).toBe(120);
      expect(Math.abs(box.tile.width - first[0].tile.width)).toBeLessThan(2);
      expect(Math.abs(box.title.top - first[0].title.top)).toBeLessThan(2);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(tiles.first()).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 900 });
  }
});

test('existing report and Deal Dump exports appear once, and use the Master Contract layout controls', async ({ page }) => {
  await signIn(page);
  await page.goto('/samples/cash-flow-lines?s.month=01&s.year=2026');
  await expect(page.getByRole('table', { name: 'Cash Flow Lines', exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: 'Export Excel', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Export table to Excel', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Change Layout', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Table Layout', exact: true })).toHaveCount(0);
  await page.goto('/reporting/view-all-transactions');
  await expect(page.getByRole('button', { name: 'Export Excel', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Export table to Excel', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Change Layout', exact: true })).toHaveCount(1);
});
