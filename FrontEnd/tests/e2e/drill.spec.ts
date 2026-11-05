// tests/e2e/drill.spec.ts
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './support';

test.beforeEach(async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
});
const LIQUIDITY = '/samples/liquidity-statement?s.company=1000&s.month=01&s.year=2026';
const listRows = (page: Page) => page.locator('section.ds-app .kit-list table.ds-table tbody tr');
const pager = (page: Page) => page.locator('.kit-pager .pagination > span').first();
const statement = (page: Page) => page.getByRole('table', { name: 'Liquidity Statement' });

test('drill to Deals and back to the report with the row outlined', async ({ page }) => {
  await page.goto(LIQUIDITY);
  await statement(page).locator('tr[data-row="A:01:01"] td.qr-drillable').first().click();
  await expect(page).toHaveURL(/\/samples\/deals\?f\.product=51A&f\.currency=INR&from=/);
  await expect(page.locator('.kit-drill-from')).toContainText('Opened from Liquidity Statement · 1000 - Demo India Ltd · 01-2026');
  await expect(listRows(page).first().locator('td').nth(2)).toHaveText('51A Term Loan');
  await expect(listRows(page).first().locator('td').nth(5)).toHaveText('INR');
  await page.getByRole('button', { name: 'Back to report' }).click();
  await expect(page).toHaveURL(/\/samples\/liquidity-statement\?s\.company=1000&s\.month=01&s\.year=2026&hl=A%3A01%3A01&u=ABSOLUTE$/);
  await expect(statement(page).locator('tr[data-row="A:01:01"] td.qr-drilled')).toBeVisible();
});

test('items: f.* fills the selection and shows it; the from bar leads back', async ({ page }) => {
  await page.goto(`/samples/monthly-amounts?f.company=1000&f.month=01&f.year=2026&from=${encodeURIComponent(LIQUIDITY)}`);
  await expect(page.getByLabel('Company Code', { exact: true })).toHaveValue('1000');
  await expect(page.getByRole('table', { name: 'Monthly Amounts' }).locator('tbody tr').first()).toBeVisible();
  await expect(page.locator('.kit-drill-from')).toContainText('Opened from Liquidity Statement · 1000 - Demo India Ltd · 01-2026');
  await page.getByRole('button', { name: 'Back to report' }).click();
  await expect(page).toHaveURL(/\/samples\/liquidity-statement\?s\.company=1000&s\.month=01&s\.year=2026$/);
  await expect(statement(page).locator('tbody tr')).toHaveCount(14);
});

test('an invalid drill filter is dropped with a notice; the valid ones filter the list', async ({ page }) => {
  await page.goto('/samples/deals?f.product=99Z&f.currency=USD');
  await expect(page.getByText('Some drill filters were not applied.')).toBeVisible();
  await expect(listRows(page).first().locator('td').nth(5)).toHaveText('USD');
  await expect(pager(page)).not.toHaveText(/of 2,000$/);
});

test('a foreign from shows no Back bar', async ({ page }) => {
  for (const from of ['//evil.com', 'https://evil.com', 'javascript:alert(1)', '/\\evil.com']) {
    await page.goto(`/samples/deals?f.currency=USD&from=${encodeURIComponent(from)}`);
    await expect(listRows(page).first()).toBeVisible();
    await expect(page.locator('.kit-drill-from')).toHaveCount(0);
  }
});

test('a cash flow line opens its deal with the from bar; Back to report runs the report again', async ({ page }) => {
  await page.goto('/samples/cash-flow-lines?s.month=01&s.year=2026');
  await page.getByRole('table', { name: 'Cash Flow Lines' }).locator('tbody tr:not(.trm-sub)').first().click();
  await expect(page.getByRole('dialog', { name: /^Deal \d{10}$/ })).toBeVisible();
  await expect(page.locator('.kit-drill-from')).toContainText('Opened from Cash Flow Lines · 01-2026');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to report' }).click();
  await expect(page).toHaveURL(/\/samples\/cash-flow-lines\?s\.month=01&s\.year=2026&u=ABSOLUTE$/);
  await expect(page.getByRole('table', { name: 'Cash Flow Lines' }).locator('tbody tr:not(.trm-sub)')).toHaveCount(40);
});

test('items: a dropped drill filter leaves the form empty and runs nothing, even with a remembered selection', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('smui-sample-monthly', JSON.stringify({ company: '2000', month: '02', year: '2026' })));
  await page.goto(`/samples/monthly-amounts?f.company=ZZZZ&f.month=01&f.year=2026&from=${encodeURIComponent(LIQUIDITY)}`);
  await expect(page.getByText('Some drill filters were not applied.')).toBeVisible();
  await expect(page.getByLabel('Company Code', { exact: true })).toHaveValue('');
  await expect(page.getByRole('heading', { name: 'Choose a selection' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Monthly Amounts' })).toHaveCount(0);
});
