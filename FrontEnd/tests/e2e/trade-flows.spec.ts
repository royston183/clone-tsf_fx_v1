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
  await expect(dialog).toContainText('BL00000001');
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
