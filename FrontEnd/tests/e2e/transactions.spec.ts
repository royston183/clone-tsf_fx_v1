// tests/e2e/transactions.spec.ts
// The TRM transaction link and its FTR_DISPLAY pop-up (components/trm), as SAP Reporting's transactions spec checks them:
// the NIIF Transaction set is answered here (page.route on the relay stub) from Reporting's synthetic records.
import { expect, test, type Page, type Route } from '@playwright/test';
import { RELAY_ORIGIN } from './relay-stub';
import { signIn } from './support';
import { moneyMarketRecord, transactionRecord } from '../support/trm-records';

const TRM_PATH = '/sap/opu/odata4/sap/zfs_sb_trmposval26e_o4_api/srvd_a2x/sap/zfs_sd_trmposval26e/0001/';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };

/** The Transaction set of company code 1000: the stock deal 1900004 (class 400013) and the money market deal 35000011. */
async function answerTransactions(page: Page) {
  await page.route(`${RELAY_ORIGIN}${TRM_PATH}**`, async (route: Route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const filter = new URL(route.request().url()).searchParams.get('$filter') ?? '';
    const rows = !filter.includes("CompanyCode eq '1000'") ? []
      : filter.includes("FinancialTransaction eq '0000001900004'") || filter.includes("SecurityClass eq '0000000400013'") ? [transactionRecord]
      : filter.includes("FinancialTransaction eq '0000035000011'") ? [moneyMarketRecord] : [];
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ value: rows }) });
  });
}
async function lookup(page: Page, number: string, kind: 'deal' | 'class' = 'deal') {
  await page.getByRole('button', { name: 'Transaction lookup', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Transaction lookup', exact: true });
  await dialog.getByLabel('Company code', { exact: true }).fill('1000');
  await dialog.getByRole('combobox', { name: 'Display', exact: true }).selectOption(kind);
  await dialog.getByLabel(kind === 'deal' ? 'Transaction number' : 'Security class ID', { exact: true }).fill(number);
  await dialog.getByRole('button', { name: number, exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
  await answerTransactions(page);
  await page.goto('/gallery');
});

test('a transaction number in a row opens the NIIF deal display, and only the pop-up opens', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('table', { name: 'Transactions' }).getByRole('button', { name: '0000001900004', exact: true }).click();
  const dialog = page.getByRole('dialog').first();
  await expect(dialog).toHaveAccessibleName('Display Stock: Structure');
  await expect(dialog).toHaveClass(/\btransaction\b/);
  expect(await dialog.evaluate(e => getComputedStyle(e).borderRadius)).toBe('12px');
  expect(await dialog.locator('.ds-modal-head').evaluate(e => getComputedStyle(e).backgroundImage)).toBe('none');
  await expect(page.getByText('Row opened')).toHaveCount(0);
  for (const text of ['Test company', 'TEST SEC', 'Settlement', 'Example Business Partner / Test Street 1 / TESTCITY 100001', '0100', 'Purchase (transaction)', '01-04-2026', '09:15:00', 'UTC+4', '1,000', '61.5', '100.00000000000000', 'Rate Table 17-10-2026', '61,500.00']) await expect(dialog).toContainText(text);
  expect(await dialog.getByRole('tab').allTextContents()).toEqual(['Structure', 'Administr.', 'Other Flows', 'Payment Details', 'Cash Flow', 'Status']);
  expect(await dialog.getByRole('tabpanel').locator('legend').allTextContents()).toEqual(['Position', 'Date Details', 'Amounts', 'Trading Data', 'Contract Conclusion']);
  await expect(dialog.getByRole('button', { name: 'Edit', exact: true })).toBeDisabled();
  await dialog.getByRole('tab', { name: 'Administr.', exact: true }).click();
  await expect(dialog).toHaveAccessibleName('Display Stock: Admin.');
  for (const text of ['Test portfolio', 'Test valuation class', 'ASSIGN-1']) await expect(dialog.getByRole('tabpanel')).toContainText(text);
  await dialog.getByRole('tab', { name: 'Other Flows', exact: true }).click();
  await expect(dialog.getByRole('tabpanel')).toContainText('Test charges');
  await expect(dialog.getByRole('tabpanel')).toContainText('Entries 1');
  await dialog.getByRole('tab', { name: 'Cash Flow', exact: true }).click();
  const flows = dialog.getByRole('tabpanel').locator('tbody tr');
  await expect(flows).toHaveCount(2);
  await expect(flows.first()).toContainText('61,500.00-');
  await expect(flows.first()).toContainText('Flagged for posting');
  await expect(dialog.getByRole('tabpanel').locator('tfoot')).toContainText('61,525.00-');
  await dialog.getByRole('tab', { name: 'Status', exact: true }).click();
  for (const text of ['Not Required', '30', 'Activity transition', '00002', 'Order - Contract - Settlement', 'Release Not Required', 'TEST2', '03-04-2026', '11:30:00']) await expect(dialog.getByRole('tabpanel')).toContainText(text);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Reporting transaction modal keeps its frame, compact fields and scrolling grids in both themes and on phones', async ({ page }) => {
  await lookup(page, '35000011');
  const dialog = page.getByRole('dialog', { name: 'Display Interest Rate Instrument: Structure', exact: true });
  for (const theme of ['light', 'dark']) {
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      const bounds = (await dialog.boundingBox())!;
      expect(bounds.width).toBeLessThanOrEqual(1040);
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      expect(await dialog.locator('.ds-modal-body').evaluate(e => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(1);
      await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeInViewport();
      await dialog.screenshot({ path: test.info().outputPath(`transaction-${theme}-${width}.png`) });
    }
  }
});

test('a money market deal opens the Interest Rate Instrument screen', async ({ page }) => {
  await lookup(page, '35000011');
  const dialog = page.getByRole('dialog').first();
  await expect(dialog).toHaveAccessibleName('Display Interest Rate Instrument: Structure');
  await expect(dialog.locator('.ftr-head')).toContainText('Product Type');
  await expect(dialog.locator('.ftr-head')).not.toContainText('Security Class');
  const panel = dialog.getByRole('tabpanel');
  expect(await panel.locator('legend').allTextContents()).toEqual(['Invest', 'Term', 'Interest Structure', 'Repayment Structure', 'Contract Conclusion']);
  for (const text of ['1100', 'Loan Given: Disbursement', '4,110,000,000.00', 'Round to the Nearest', '01-01-2025', '01-01-2027', 'Start Included', 'Fixed Term',
    'Fixed', '6.0000000', 'act/365', 'At End of Term', '1200', 'Nominal interest', 'Final Repayment', '1120', 'MIC']) await expect(panel).toContainText(text);
  await dialog.getByRole('tab', { name: 'Cash Flow', exact: true }).click();
  await expect(dialog.getByRole('tabpanel').locator('tbody tr')).toHaveCount(3);
});

test('security-class transactions open the same pop-up and return to the class', async ({ page }) => {
  await lookup(page, '400013', 'class');
  await expect(page.getByRole('dialog')).toHaveAccessibleName('Security class 400013');
  await expect(page.getByLabel('Transactions per page', { exact: true })).toHaveValue('20');
  await expect(page.getByRole('dialog')).toContainText('01-04-2026');
  await page.getByRole('button', { name: '1900004', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveAccessibleName('Display Stock: Structure');
  await page.getByRole('button', { name: 'Back to class' }).click();
  await expect(page.getByRole('dialog')).toHaveAccessibleName('Security class 400013');
});

test('a transaction SAP does not have stays inside the pop-up with Retry', async ({ page }) => {
  await lookup(page, 'MISSING');
  const dialog = page.getByRole('dialog', { name: 'Transaction MISSING' });
  await expect(dialog.getByRole('alert')).toContainText('Transaction MISSING in company code 1000 was not found');
  await expect(dialog.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
  await expect(dialog.locator('.ds-modal-foot').getByRole('button', { name: 'Close', exact: true })).toBeInViewport();
});
