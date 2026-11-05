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
  await expect(page.getByText('ALMOND - Almonds').first()).toBeVisible();
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
  await expect(modal.getByRole('radio', { name: 'Invalid 7' })).toBeVisible();
  await expect(modal.getByText('NAM6036645 already exists.')).toBeVisible();
  await modal.getByRole('button', { name: 'Post 3 Rows' }).click();
  await expect(page.locator('.ds-toast')).toHaveText('3 created, 0 updated, 7 invalid rows left out');
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

test('Propose Tradeflow shows proposals for the chosen Deal ID and assigns one from its detail', async ({ page }) => {
  await page.goto('/trade-flows/propose-tradeflow');
  const deals = page.locator('.tsf-propose__deals');
  await page.getByLabel('Open only').uncheck();
  await expect(deals.getByRole('button', { name: 'Deal 7000000160' })).toContainText('No USD rate');
  await deals.getByRole('button', { name: 'Deal 7000000142' }).click();
  await expect(page.locator('.tsf-propose__hero')).toContainText('2,83,800.00 USD');
  const cards = page.locator('.tsf-propose__card');
  await expect(cards.first()).toContainText('Best match');
  await expect(page.locator('.tsf-propose__fallback')).toContainText('AI is not configured. Ranked by closeness.');
  await page.getByRole('button', { name: 'At most 2 BLs' }).click();
  await expect(page.locator('.tsf-propose__rule')).toContainText('at most 2 BLs');
  await page.getByRole('button', { name: 'At most 2 BLs' }).click();
  await cards.first().click();
  const modal = page.getByRole('dialog', { name: /Proposal 1 for 7000000142/ });
  await expect(modal).toContainText('Effect on the deal');
  await expect(modal.getByRole('table', { name: 'BLs in the proposal' })).toBeVisible();
  await modal.getByRole('button', { name: /Assign 3 BLs to 7000000142/ }).click();
  await expect(page.locator('.ds-toast')).toContainText('assigned to 7000000142');
  await expect(deals.getByRole('button', { name: 'Deal 7000000142' })).toContainText('Filled');
});
