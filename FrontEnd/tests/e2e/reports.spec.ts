// tests/e2e/reports.spec.ts
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { appData, signIn } from './support';

test.beforeEach(async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
});
const LIQUIDITY = '/samples/liquidity-statement?s.company=1000&s.month=01&s.year=2026';
const LINES = '/samples/cash-flow-lines?s.month=01&s.year=2026';
const statement = (page: Page) => page.getByRole('table', { name: 'Liquidity Statement' });
const lines = (page: Page) => page.getByRole('table', { name: 'Cash Flow Lines' });
const details = (page: Page) => lines(page).locator('tbody tr:not(.trm-sub)');
const picked = (page: Page) => page.getByLabel('Layout', { exact: true }).locator('option:checked');
/**
 * Leaves the screen inside the page and comes back with the browser's Back button. The layouts of a module without a data
 * source live in this page's memory, so a full reload would lose them; the screen has to start again all the same.
 */
async function leaveAndReturn(page: Page) {
  await page.locator('.sidebar').getByRole('link', { name: /Overview/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
  await page.goBack();
}

/** Deletes a saved layout through the app's API (ignores one that is already gone), so a failed run leaves none behind. */
const dropLayout = (page: Page, name: string, scope: 'shared' | 'personal') =>
  appData(page, 'layoutsRemove', 'sample-cashflow', name, scope).then(() => undefined, () => undefined);

test('the Gallery lists the report items and templates', async ({ page }) => {
  await page.goto('/gallery');
  for (const id of ['T-report', 'T-line-report', 'D-layout', 'F-row-styles', 'B-drill-from']) await expect(page.locator(`[data-gallery-id="${id}"]`)).toBeVisible();
  await expect(page.locator('[data-gallery-id="T-report"]').getByRole('link', { name: 'Open the Liquidity Statement' })).toHaveAttribute('href', LIQUIDITY);
});

test('formatted report: nothing runs until Run; row styles, zero rows, the hide flag and the unit', async ({ page }) => {
  await page.goto('/samples/liquidity-statement');
  await expect(page.getByRole('heading', { name: 'Choose a selection' })).toBeVisible();
  await page.getByLabel('Company Code', { exact: true }).fill('1000');
  await page.getByLabel('Period', { exact: true }).selectOption('01');
  await page.getByLabel('Period year').fill('2026');
  await page.getByRole('button', { name: 'Run' }).click();
  await expect(page).toHaveURL(/\/samples\/liquidity-statement\?s\.company=1000&s\.month=01&s\.year=2026$/);
  const rows = statement(page).locator('tbody tr');
  await expect(rows).toHaveCount(14);
  await expect(statement(page).locator('tr[data-row="A"]')).toHaveClass('qr-heading');
  await expect(statement(page).locator('tr[data-row="C"]')).toHaveClass('qr-mismatch');
  await expect(statement(page).locator('tr[data-row="E"]')).toHaveClass('qr-percent');
  await expect(statement(page).locator('tr[data-row="E"] td').nth(4)).toHaveText('-17.54 %');
  await expect(statement(page).locator('tr[data-row="A:01:01"] td').nth(2)).toHaveText('1,320,000.00');
  // Only non-zero amounts drill; percent rows and rows the module maps to none never do.
  await expect(statement(page).locator('tr[data-row="E"] td.qr-drillable')).toHaveCount(0);
  await expect(statement(page).locator('tr[data-row="E"] button.qr-drill')).toHaveCount(0);
  await expect(statement(page).locator('tr[data-row="AT"] td.qr-drillable')).toHaveCount(0);
  await expect(statement(page).locator('tr[data-row="A:01:02"] td').nth(2)).not.toHaveClass(/qr-drillable/);
  await expect(statement(page).locator('tr[data-row="A:01:02"] td').nth(4)).toHaveClass(/qr-drillable/);
  await page.getByLabel('Display zero values').check();
  await expect(rows).toHaveCount(15);
  await page.getByLabel('Hide interest split rows').check();
  await expect(rows).toHaveCount(13);
  await page.getByLabel('Amounts in').selectOption('LAKHS');
  await expect(statement(page).locator('tr[data-row="A:01:01"] td').nth(2)).toHaveText('13.20');
  await expect(statement(page).locator('tr[data-row="E"] td').nth(4)).toHaveText('-17.54 %');
});

test('breakdown: drill, drill again, Back closes one level; a deep link reopens it', async ({ page }) => {
  await page.goto(LIQUIDITY);
  await statement(page).getByRole('button', { name: 'A', exact: true }).click();
  const first = page.getByRole('dialog', { name: 'A · A. Outflows' });
  await expect(first.locator('tbody tr')).toHaveCount(1);
  await expect(first.locator('tfoot')).toContainText('24,600,000.00');
  await expect(page).toHaveURL(/drill=/);
  await first.getByRole('button', { name: 'A:01', exact: true }).click();
  const second = page.getByRole('dialog', { name: 'A:01 · Borrowings' });
  await expect(second.locator('tbody tr')).toHaveCount(2);
  await expect(second.getByRole('button', { name: 'Back to A' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog', { name: 'A · A. Outflows' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).not.toHaveURL(/drill=/);
  await page.goto(`${LIQUIDITY}&drill=${encodeURIComponent('[{"row":"A","column":"b1"}]')}`);
  await expect(page.getByRole('dialog', { name: 'A · A. Outflows' })).toContainText('1–7 days');
});

test('a stale breakdown link says the row is gone', async ({ page }) => {
  await page.goto(`${LIQUIDITY}&drill=${encodeURIComponent('[{"row":"A:09","column":"b1"}]')}`);
  const dialog = page.getByRole('dialog', { name: 'A:09' });
  await expect(dialog).toContainText('This row is no longer in the report.');
  await dialog.locator('.ds-modal-foot').getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).not.toHaveURL(/drill=/);
});

test('cash flow lines: subtotals per company and counterparty, totals per currency; a line opens its deal', async ({ page }) => {
  await page.goto(LINES);
  await expect(details(page)).toHaveCount(40);
  await expect(lines(page).locator('tr.trm-sub-0').filter({ hasText: 'Company Code: 1000' })).toContainText('20 rows');
  await expect(lines(page).locator('tr.trm-sub-0').filter({ hasText: 'Company Code: 2000' })).toContainText('20 rows');
  const totals = lines(page).locator('tfoot tr');
  await expect(totals).toHaveCount(2);
  await expect(totals.nth(0)).toContainText('INR');
  await expect(totals.nth(1)).toContainText('USD');
  await details(page).first().click();
  await expect(page).toHaveURL(/\/samples\/deals\?open=\d{10}&from=%2Fsamples%2Fcash-flow-lines/);
  await expect(page.getByRole('dialog', { name: /^Deal \d{10}$/ })).toBeVisible();
});

test('a link with a run shows exactly its selection, not the values remembered from the last run', async ({ page }) => {
  await page.goto('/samples/cash-flow-lines');
  await page.getByLabel('Company Code', { exact: true }).fill('2000');
  await page.getByLabel('Period', { exact: true }).selectOption('01');
  await page.getByLabel('Period year').fill('2026');
  await page.getByRole('button', { name: 'Run' }).click();
  await expect(details(page)).toHaveCount(20);
  await page.goto(LINES);
  await expect(details(page)).toHaveCount(40);
  await expect(page.getByLabel('Company Code', { exact: true })).toHaveValue('');
  await expect(lines(page).locator('tr.trm-sub-0').filter({ hasText: 'Company Code: 1000' })).toHaveCount(1);
  await expect(lines(page).locator('tr.trm-sub-0').filter({ hasText: 'Company Code: 2000' })).toHaveCount(1);
});

test('layouts: change, save a shared default, reload, a personal default wins, delete both', async ({ page }) => {
  try {
    await page.goto(LINES);
    await expect(details(page)).toHaveCount(40);
    await page.getByRole('button', { name: 'Change Layout' }).click();
    let change = page.getByRole('dialog', { name: 'Change Layout' });
    await change.getByRole('option', { name: 'Deal', exact: true }).click();
    await change.getByRole('button', { name: 'Hide the selected column' }).click();
    await change.getByRole('tab', { name: 'Subtotals' }).click();
    await change.getByRole('button', { name: 'Remove Counterparty' }).click();
    await change.getByRole('button', { name: 'OK' }).click();
    await expect(lines(page).getByRole('button', { name: 'Deal', exact: true })).toHaveCount(0);
    await expect(lines(page).locator('tr.trm-sub-1')).toHaveCount(0);
    await expect(picked(page)).toHaveText('Standard layout *');

    await page.getByRole('button', { name: 'Save Layout', exact: true }).click();
    let save = page.getByRole('dialog', { name: 'Save Layout' });
    await save.getByLabel('Layout name').fill('By company');
    await save.getByLabel('Default layout (opens with the screen)').check();
    await save.getByRole('button', { name: 'Save Layout' }).click();
    await expect(save).toBeHidden();
    await expect(picked(page)).toHaveText('By company (default)');
    await leaveAndReturn(page);
    await expect(picked(page)).toHaveText('By company (default)');
    await expect(lines(page).getByRole('button', { name: 'Deal', exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: 'Change Layout' }).click();
    change = page.getByRole('dialog', { name: 'Change Layout' });
    await change.getByRole('tab', { name: 'Display', exact: true }).click();
    await change.getByLabel('Show subtotal lines only').check();
    await change.getByRole('button', { name: 'OK' }).click();
    await expect(details(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Save Layout', exact: true }).click();
    save = page.getByRole('dialog', { name: 'Save Layout' });
    await save.getByLabel('Layout name').fill('Mine');
    await save.getByRole('radio', { name: 'Only me' }).click();
    await save.getByRole('button', { name: 'Save Layout' }).click();
    await expect(picked(page)).toHaveText('Mine (default)');
    await leaveAndReturn(page);
    await expect(picked(page)).toHaveText('Mine (default)');
    await expect(details(page)).toHaveCount(0);

    await page.getByRole('button', { name: 'Delete layout' }).click();
    await page.getByRole('dialog', { name: 'Delete layout' }).getByRole('button', { name: 'Yes, Delete' }).click();
    await expect(picked(page)).toHaveText('Standard layout');
    await page.getByLabel('Layout', { exact: true }).selectOption({ label: 'By company (default)' });
    await page.getByRole('button', { name: 'Delete layout' }).click();
    await page.getByRole('dialog', { name: 'Delete layout' }).getByRole('button', { name: 'Yes, Delete' }).click();
    await expect(picked(page)).toHaveText('Standard layout');
    await expect(lines(page).locator('tr.trm-sub-1').first()).toBeVisible();
  } finally {
    await dropLayout(page, 'Mine', 'personal');
    await dropLayout(page, 'By company', 'shared');
  }
});

test('exports what the report shows to Excel and CSV', async ({ page }) => {
  await page.goto(LINES);
  await expect(details(page)).toHaveCount(40);
  const [excel] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export Excel' }).click()]);
  expect(excel.suggestedFilename()).toMatch(/^sample-cashflow-\d{8}\.xlsx$/);
  expect(await readFile(await excel.path(), 'latin1')).toContain('Cash Flow Lines');
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()]);
  expect(csv.suggestedFilename()).toMatch(/^sample-cashflow-\d{8}\.csv$/);
  const text = await readFile(await csv.path(), 'utf8');
  expect(text).toContain('Level,Company Code,Counterparty,Deal,Product Type,Flow Type,Payment Date,Amount,Currency');
  expect(text).toContain('Total,Total');
});

test('a drill link with a dropped filter fills the bar under the notice and runs nothing, even with a remembered company', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('smui-sample-cashflow', JSON.stringify({ company: '2000', month: '02', year: '2026' })));
  await page.goto(`/samples/cash-flow-lines?f.company=9999&f.month=01&f.year=2026&from=${encodeURIComponent('/samples/treasury-overview?s.company=1000&s.month=01&s.year=2026')}`);
  await expect(page.getByText('Some drill filters were not applied.')).toBeVisible();
  await expect(page.getByLabel('Company Code', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Period', { exact: true })).toHaveValue('01');
  await expect(page.getByLabel('Period year')).toHaveValue('2026');
  await expect(page.getByRole('heading', { name: 'Choose a selection' })).toBeVisible();
  await expect(page.locator('.kit-drill-from')).toContainText('Opened from Treasury Overview');
  await expect(lines(page)).toHaveCount(0);
  // A bookmark without the required company waits for input too, instead of a server error.
  await page.goto('/samples/liquidity-statement?s.month=01&s.year=2026');
  await expect(page.getByRole('heading', { name: 'Choose a selection' })).toBeVisible();
  await expect(page.getByLabel('Period', { exact: true })).toHaveValue('01');
  await expect(statement(page)).toHaveCount(0);
  // Run with the company filled reads it.
  await page.getByLabel('Company Code', { exact: true }).fill('1000');
  await page.getByRole('button', { name: 'Run' }).click();
  await expect(statement(page).locator('tbody tr')).toHaveCount(14);
});

test('Run reads again when the URL differs only outside the selection; u starts the unit', async ({ page }) => {
  await page.goto(`${LIQUIDITY}&hl=A%3A01%3A01&u=LAKHS`);
  await expect(statement(page).locator('tr[data-row="A:01:01"] td').nth(2)).toHaveText('13.20');
  await expect(page.getByLabel('Amounts in')).toHaveValue('LAKHS');
  await page.getByRole('button', { name: 'Run' }).click();
  await expect(page).toHaveURL(/\/samples\/liquidity-statement\?s\.company=1000&s\.month=01&s\.year=2026$/);
  await expect(statement(page).locator('tbody tr')).toHaveCount(14);
  await expect(page.getByLabel('Amounts in')).toHaveValue('LAKHS');
  // A unit the report does not have is dropped with the notice; the report still runs in its own unit.
  await page.goto(`${LIQUIDITY}&u=MILLIONS`);
  await expect(page.getByText('Some drill filters were not applied.')).toBeVisible();
  await expect(statement(page).locator('tbody tr')).toHaveCount(14);
});
