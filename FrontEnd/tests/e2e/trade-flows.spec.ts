import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { signIn } from './support';
import { stubTradeflowService } from './tradeflow-stub';

let sap: Awaited<ReturnType<typeof stubTradeflowService>>;
test.beforeEach(async ({ page }) => {
  await signIn(page);
  sap = await stubTradeflowService(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
});

test('Master Data and Trade Flows follow Overview on the rail with their tiles', async ({ page }) => {
  const rail = page.locator('.sidebar');
  const names = await rail.getByRole('link').allInnerTexts();
  const at = (n: string) => names.findIndex(t => t.trim() === n);
  expect(at('Master Data')).toBe(at('Overview') + 1);
  expect(at('Trade Flows')).toBe(at('Overview') + 2);
  await page.goto('/master-data');
  await expect(page.getByRole('link', { name: /Maintain Commodity/ })).toBeVisible();
  await page.goto('/trade-flows');
  for (const tile of ['Tradeflows Upload', 'Tradeflows List', 'Update Price', 'Manage Tradeflows', 'Propose Tradeflow']) await expect(page.getByRole('link', { name: new RegExp(`^${tile}`) })).toBeVisible();
});

test('Maintain Commodity and Update Price list their sample rows', async ({ page }) => {
  await page.goto('/master-data/maintain-commodity');
  await expect(page.getByRole('cell', { name: 'ALMOND', exact: true })).toBeVisible();
  await page.goto('/trade-flows/update-price');
  // Update Price works from a date: every commodity with its price for that day, or Missing with the last earlier price.
  await page.getByLabel('Price date').fill('2026-11-01');
  const table = page.getByRole('table', { name: 'Commodity prices on 01-11-2026' });
  const almond = table.getByRole('row').filter({ hasText: 'ALMOND' });
  await expect(almond).toContainText('Price set');
  await expect(almond.getByLabel('Price of ALMOND on 01-11-2026')).toHaveValue('2.1500');
  const cotton = table.getByRole('row').filter({ hasText: 'COTTON' });
  await expect(cotton).toContainText('Missing');
  await expect(cotton).toContainText('1.8000 USD from 15-09-2026');
  await expect(table.getByRole('columnheader', { name: /Effective From/ })).toHaveCount(0);
  // Only the missing ones, then set COTTON's price for the day and save it.
  await page.getByRole('radio', { name: /^Missing/ }).click();
  await expect(table.getByRole('row').filter({ hasText: 'ALMOND' })).toHaveCount(0);
  await cotton.getByLabel('Price of COTTON on 01-11-2026').fill('1.95');
  await expect(cotton).toContainText('New');
  await page.getByRole('button', { name: 'Save 1 price' }).click();
  await expect(page.locator('.ds-toast')).toContainText('1 price added for 01-11-2026');
  await page.getByRole('radio', { name: /^All/ }).click();
  await expect(table.getByRole('row').filter({ hasText: 'COTTON' })).toContainText('Price set');
  await expect(table.getByLabel('Price of COTTON on 01-11-2026')).toHaveValue('1.9500');
});

test('Tradeflows List shows price and value and opens a trade flow with its Bill of Lading', async ({ page }) => {
  await page.goto('/trade-flows/tradeflows-list');
  await expect(page.getByText('No price').first()).toBeVisible();
  await page.getByText('TF00000001', { exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('NAM6036645');
  await dialog.getByRole('tab', { name: 'Bill of Lading' }).click();
  await expect(dialog).toContainText('4000000001');
});

test('Tradeflows Upload refuses the 7 BL Numbers SAP already holds and posts the 3 new rows of TF.xlsx', async ({ page }) => {
  await page.goto('/trade-flows/tradeflows-upload');
  await page.getByRole('button', { name: 'Upload File' }).click();
  const modal = page.getByRole('dialog', { name: /Upload Trade Flows/i });
  await modal.locator('input[type=file]').setInputFiles({
    name: 'TF.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: readFileSync(path.resolve('tests/fixtures/tf-sample.xlsx'))
  });
  await expect(modal.locator('tbody tr')).toHaveCount(10);
  // Rows already in SAP are Duplicates, not Invalid.
  await expect(modal.getByRole('radio', { name: 'Duplicate 7' })).toBeVisible();
  await expect(modal.getByRole('radio', { name: 'Invalid 0' })).toBeVisible();
  await expect(modal.getByText('NAM6036645 already exists.')).toBeVisible();
  await modal.getByRole('button', { name: 'Post 3 Rows' }).click();
  await expect(page.locator('.ds-toast')).toHaveText('3 created, 0 updated, 7 duplicate rows left out');
  expect(sap.created.map(r => r.BlNumber)).toEqual(['YMLUW160408059', 'NAM5952782', 'NAM5952783']);
  // The browser never sends TF No: SAP (here the stub) numbers each trade flow from ZSGTSFNR02's interval.
  expect(sap.created.map(r => String(r.TfNo))).toEqual(['3000000011', '3000000012', '3000000013']);
});

test('Manage Tradeflows splits a BL into three and keeps the old one, flagged as deleted', async ({ page }) => {
  await page.goto('/trade-flows/manage-tradeflows');
  await page.getByText('TF00000001', { exact: true }).click();
  await expect(page.getByRole('heading', { name: /TF00000001/ })).toBeVisible();
  await page.getByRole('button', { name: 'Split BL 4000000001' }).click();
  const dialog = page.getByRole('dialog', { name: 'Split BL 4000000001' });
  await dialog.getByLabel('Number of BLs').fill('3');
  await dialog.getByRole('button', { name: 'Next' }).click();
  await expect(dialog.getByLabel('Quantity of BL 1')).toHaveValue('14666.667');
  await dialog.getByLabel('Quantity of BL 1').fill('50000');
  await expect(dialog.getByText(/The BLs add up to .* more than the 44000.000 available/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Save 3 BLs' })).toBeDisabled();
  await dialog.getByLabel('Quantity of BL 1').fill('14666.667');
  await dialog.getByRole('button', { name: 'Save 3 BLs' }).click();
  await expect(page.locator('.ds-toast')).toHaveText('BL 4000000001 split into 3 BLs');
  await expect(page.getByText('3 active · 1 deleted')).toBeVisible();
  await page.getByLabel('Show deleted BLs').check();
  await expect(page.locator('tr.deleted')).toContainText('4000000001');
});

test('Manage Tradeflows locks a BL that carries a Deal ID', async ({ page }) => {
  await page.goto('/trade-flows/manage-tradeflows');
  await page.getByText('TF00000004', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Split BL 4000000004' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Delete BL 4000000004' })).toBeDisabled();
});

test('Propose Tradeflow: options and typed conditions shape the proposals, accepting assigns once, the deal shows its BLs', async ({ page }) => {
  const shots = process.env.PROPOSE_SHOTS;
  await page.goto('/trade-flows/propose-tradeflow');
  const deals = page.locator('.tsf-propose__deals');
  await deals.getByRole('button', { name: 'All', exact: true }).click();
  await expect(deals.getByRole('row').filter({ hasText: '7000000160' })).toContainText('No USD rate');
  await deals.getByRole('button', { name: 'Deal 7000000142' }).click();
  await expect(page.locator('.tsf-propose__hero')).toContainText('283,800.00');
  // Multiple-choice ways of filling, all three chosen by default; each can be turned off alone, never the last one.
  await expect(page.getByRole('button', { name: 'Fewest BLs' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Oldest trade flows' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Oldest trade flows' }).click();
  await expect(page.getByRole('button', { name: 'Oldest trade flows' })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'Fewest BLs' })).toHaveAttribute('aria-pressed', 'true');
  const cards = page.getByRole('table', { name: 'Proposals' }).locator('tbody tr');
  await expect(cards.first()).toContainText('Best match');
  // No two proposals with the same amount and number of BLs.
  const seen = await cards.evaluateAll(els => els.map(e => `${e.children[1]?.textContent}|${e.children[3]?.textContent}`));
  expect(new Set(seen).size).toBe(seen.length);
  if (shots) await page.screenshot({ path: `${shots}/1-proposals.png`, fullPage: true });

  // A deal condition the deal does not meet: the no-match message, and no proposal at all.
  const conditions = page.getByLabel('Conditions', { exact: true });
  await conditions.fill('deals above 5L');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.locator('.tsf-propose__understood')).toContainText('deal amount > 500,000 USD');
  await expect(page.locator('.tsf-propose__none')).toContainText('No matching deals or available BLs found for the selected criteria.');
  await expect(cards).toHaveCount(0);
  if (shots) await page.screenshot({ path: `${shots}/2-no-match.png`, fullPage: true });

  // Excluding the best proposal's first BL: no proposal uses it.
  await page.getByRole('button', { name: 'Clear conditions' }).click();
  await expect(cards.first()).toBeVisible();
  // The BL numbers of a proposal are in the tooltip of its BL dates cell.
  const firstBl = ((await cards.first().locator('.tsf-propose__bls').getAttribute('title')) ?? '').match(/\b4\d{9}\b/)?.[0] ?? '';
  expect(firstBl).toMatch(/^\d{10}$/);
  await conditions.fill(`exclude BL ${firstBl}`);
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.locator('.tsf-propose__understood')).toContainText(`exclude BL ${firstBl}`);
  await expect(cards.first()).toBeVisible();
  for (const text of await cards.locator('.tsf-propose__bls').evaluateAll(els => els.map(e => e.getAttribute('title') ?? ''))) expect(text).not.toContain(firstBl);
  if (shots) await page.screenshot({ path: `${shots}/3-excluded.png`, fullPage: true });

  // Clear all: no way chosen (all three are used), no conditions; the proposals stay.
  await page.getByRole('button', { name: 'Clear all selections and conditions' }).click();
  await expect(page.locator('.tsf-propose__understood')).toHaveCount(0);
  for (const way of ['Fewest BLs', 'Closest amount', 'Oldest trade flows']) await expect(page.getByRole('button', { name: way })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.tsf-propose__allways')).toHaveText('All ways');
  await expect(cards.first()).toBeVisible();

  await cards.first().getByRole('button', { name: /^Proposal 1:/ }).click();
  const modal = page.getByRole('dialog', { name: /Proposal 1 for 7000000142/ });
  await expect(modal).toContainText('Effect on the deal');
  await expect(modal.getByRole('table', { name: 'BLs in the proposal' })).toBeVisible();
  await modal.getByRole('button', { name: /Assign \d+ BLs? to 7000000142/ }).click();
  await expect(page.locator('.ds-toast')).toContainText('assigned to 7000000142');
  await expect(deals.getByRole('row').filter({ hasText: '7000000142' })).toContainText('Filled');
  // The deal's assigned BLs, by trade flow: on the page and from the deal list.
  await expect(page.getByRole('table', { name: 'BLs assigned to 7000000142' })).toBeVisible();
  if (shots) { await page.waitForTimeout(500); await page.screenshot({ path: `${shots}/4-assigned.png`, fullPage: true }); }
  await deals.getByRole('button', { name: 'With BLs' }).click();
  await deals.getByRole('button', { name: 'View the BLs assigned to 7000000142' }).click();
  const list = page.getByRole('dialog', { name: 'BLs assigned to 7000000142' });
  await expect(list.getByRole('table', { name: 'BLs assigned to 7000000142' })).toContainText(/Total · \d+ BLs?/);
  if (shots) {
    await list.getByRole('button', { name: 'Close', exact: true }).last().click();
    await deals.getByRole('button', { name: 'All', exact: true }).click();
    await deals.getByRole('button', { name: 'Deal 7000000101' }).click();
    await page.getByRole('button', { name: 'Night' }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${shots}/5-dark.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${shots}/6-narrow-dark.png`, fullPage: true });
  }
});
