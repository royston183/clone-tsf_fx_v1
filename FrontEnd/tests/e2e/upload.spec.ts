import { expect, test } from '@playwright/test';
import { xlsxFixture } from '../support/xlsx-fixture';
import { signIn } from './support';

test.beforeEach(async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
});

test('upload: template, preview with status filter, post', async ({ page }) => {
  await page.goto('/samples/budget-upload');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Template' }).click();
  expect((await download).suggestedFilename()).toBe('budget-upload-template.xlsx');

  await page.getByRole('button', { name: 'Upload File' }).click();
  const dialog = page.getByRole('dialog', { name: 'Upload Budget Lines' });
  await dialog.locator('input[type=file]').setInputFiles({
    name: 'budget.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: xlsxFixture([{ name: 'Budget', rows: [
      ['GL Account', 'Cost Center', 'Period', 'Period Year', 'Amount', 'Currency'],
      ['400100', 'CC30', 'April', 2026, 125000.5, 'INR'],
      ['400100', 'CC10', 4, 2026, 99000, 'INR'],
      ['999999', 'CC10', 4, 2026, 10, 'INR']
    ] }])
  });
  await expect(dialog.getByRole('radio', { name: 'All 3' })).toBeVisible();
  await expect(dialog.getByRole('radio', { name: 'New 1' })).toBeVisible();
  await expect(dialog.getByRole('radio', { name: 'Update 1' })).toBeVisible();
  await dialog.getByRole('radio', { name: 'Invalid 1' }).click();
  await expect(dialog.locator('tbody tr')).toHaveCount(1);
  await expect(dialog.locator('tbody tr').first()).toContainText("GL Account '999999' is not in the list.");
  await expect(dialog.locator('tbody tr.tb-bad')).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Post 2 Rows' }).click();
  await expect(page.locator('.ds-toast')).toHaveText('1 created, 1 updated, 1 invalid row left out');
  await expect(page.getByText('Posted: 1 created, 1 updated, 1 invalid row left out.')).toBeVisible();
});

test('a file without the headings names the missing columns', async ({ page }) => {
  await page.goto('/samples/budget-upload');
  await page.getByRole('button', { name: 'Upload File' }).click();
  const dialog = page.getByRole('dialog', { name: 'Upload Budget Lines' });
  await dialog.locator('input[type=file]').setInputFiles({
    name: 'notes.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: xlsxFixture([{ name: 'Notes', rows: [['Read me first']] }, { name: 'Budget', rows: [['GL Account']] }])
  });
  await expect(dialog.getByRole('alert')).toContainText('The file has no "GL Account"');
  await expect(dialog.getByRole('button', { name: 'Post 0 Rows' })).toBeDisabled();
});
