// tests/e2e/dashboard.spec.ts
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './support';

test.beforeEach(async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
});
const BOARD = '/samples/treasury-overview?s.company=1000&s.month=01&s.year=2026';
const gap = (page: Page) => page.getByRole('region', { name: 'Mismatch 1–7 days by month' });

test('the Gallery lists the dashboard items', async ({ page }) => {
  await page.goto('/gallery');
  for (const id of ['T-dashboard', 'B-kpi-tile', 'B-charts']) await expect(page.locator(`[data-gallery-id="${id}"]`)).toBeVisible();
});

test('Show loads every section; one tile is red; a range switch reloads only that chart', async ({ page }) => {
  await page.goto('/samples/treasury-overview');
  await expect(page.getByRole('heading', { name: 'Choose a period' })).toBeVisible();
  await page.getByLabel('Company Code', { exact: true }).fill('1000');
  await page.getByLabel('Period', { exact: true }).selectOption('01');
  await page.getByLabel('Period year').fill('2026');
  await page.getByRole('button', { name: 'Show' }).click();
  await expect(page).toHaveURL(/\/samples\/treasury-overview\?s\.company=1000&s\.month=01&s\.year=2026$/);
  await expect(page.locator('.ov-tile')).toHaveCount(4);
  const red = page.locator('.ov-tile.red');
  await expect(red).toHaveCount(1);
  await expect(red).toContainText('Mismatch up to 30 days');
  await expect(red).toContainText('-17.54 %');
  await expect(red).toContainText('Breach');
  await expect(gap(page).locator('path.ov-tbar')).toHaveCount(6);
  await expect(gap(page).locator('path.ov-tbar.out.red')).toHaveCount(2);
  await expect(gap(page).locator('path.ov-tbar.out.amber')).toHaveCount(1);
  await expect(page.locator('.ov-chips')).toContainText('Cash flows: 20 lines');

  await gap(page).getByRole('button', { name: '12 months' }).click();
  await expect(gap(page).locator('path.ov-tbar')).toHaveCount(12);
  await gap(page).getByRole('button', { name: 'Last 4 quarters' }).click();
  await expect(gap(page).locator('path.ov-tbar')).toHaveCount(4);
  await expect(page.locator('.ov-tile')).toHaveCount(4);
});

test('tiles click through to both reports with the dashboard selection; Back to dashboard', async ({ page }) => {
  await page.goto(BOARD);
  await page.getByRole('button', { name: 'Mismatch up to 30 days', exact: true }).click();
  await expect(page).toHaveURL(/\/samples\/liquidity-statement\?f\.company=1000&f\.month=01&f\.year=2026&from=/);
  await expect(page.getByRole('table', { name: 'Liquidity Statement' }).locator('tbody tr')).toHaveCount(14);
  await expect(page.locator('.kit-drill-from')).toContainText('Opened from Treasury Overview · 1000 - Demo India Ltd · 01-2026');
  await page.getByRole('button', { name: 'Back to dashboard' }).click();
  await expect(page.locator('.ov-tile')).toHaveCount(4);
  await page.getByRole('button', { name: 'Cash flow lines', exact: true }).click();
  await expect(page).toHaveURL(/\/samples\/cash-flow-lines\?f\.company=1000&f\.month=01&f\.year=2026&from=/);
  await expect(page.getByRole('table', { name: 'Cash Flow Lines' }).locator('tbody tr:not(.trm-sub)')).toHaveCount(20);
});

test('the summary table opens a column inline with its lines and a link', async ({ page }) => {
  await page.goto(BOARD);
  const summary = page.getByRole('region', { name: 'Liquidity summary' });
  await summary.getByRole('button', { name: '1–7 days', exact: true }).click();
  const lines = summary.locator('.ov-drill');
  await expect(lines).toContainText('Term loans');
  await expect(lines).toContainText('Fixed deposits');
  await expect(lines).toContainText('Interest receivable');
  await expect(lines).not.toContainText('Bonds');
  await lines.getByRole('button', { name: 'Open the Liquidity Statement' }).click();
  await expect(page).toHaveURL(/\/samples\/liquidity-statement\?f\.company=1000/);
});

test('a URL value that fails its check is dropped with the notice; nothing runs and no remembered value fills the gap', async ({ page }) => {
  await page.goto(BOARD);
  await expect(page.locator('.ov-tile')).toHaveCount(4);
  await page.goto('/samples/treasury-overview?s.company=9999&s.month=01&s.year=2026');
  await expect(page.getByText('Some drill filters were not applied.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Choose a period' })).toBeVisible();
  await expect(page.getByLabel('Company Code', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Period', { exact: true })).toHaveValue('01');
  await expect(page.locator('.ov-tile')).toHaveCount(0);
});

test('tiles and charts name the unit; the unit travels with a click-through and back', async ({ page }) => {
  await page.goto(BOARD);
  const tiles = page.locator('.ov-tile');
  // The chart images name the unit in their labels too: pick the select itself.
  const unit = page.locator('label', { hasText: 'Amounts in' }).locator('select');
  await expect(tiles).toHaveCount(4);
  await expect(tiles.nth(0)).toContainText('246.00 Lakhs INR');
  await expect(tiles.nth(1)).toContainText('0 % of limit used · limit -10.00 %');
  await expect(tiles.nth(2)).toContainText('117 % of limit used · limit -15.00 %');
  await expect(page.getByRole('region', { name: 'Cash flows in INR' })).toContainText('Amounts in Lakhs');
  await unit.selectOption('CRORES');
  await expect(tiles.nth(0)).toContainText('2.46 Crores INR');
  await expect(page.getByRole('region', { name: 'Cash flows in INR' })).toContainText('Amounts in Crores');
  await page.getByRole('button', { name: 'Mismatch up to 30 days', exact: true }).click();
  await expect(page).toHaveURL(/\/samples\/liquidity-statement\?f\.company=1000&f\.month=01&f\.year=2026&from=[^&]*u%3DCRORES&u=CRORES$/);
  await expect(unit).toHaveValue('CRORES');
  await expect(page.getByRole('table', { name: 'Liquidity Statement' }).locator('tr[data-row="A:01:01"] td').nth(2)).toHaveText('0.13');
  await page.getByRole('button', { name: 'Back to dashboard' }).click();
  await expect(page).toHaveURL(/\/samples\/treasury-overview\?s\.company=1000&s\.month=01&s\.year=2026&u=CRORES$/);
  await expect(unit).toHaveValue('CRORES');
  await expect(tiles.nth(0)).toContainText('2.46 Crores INR');
  // A unit the dashboard does not have is dropped with the notice; the dashboard still shows, in its first unit.
  await page.goto(`${BOARD}&u=ABSOLUTE`);
  await expect(page.getByText('Some drill filters were not applied.')).toBeVisible();
  await expect(tiles.nth(0)).toContainText('246.00 Lakhs INR');
});
