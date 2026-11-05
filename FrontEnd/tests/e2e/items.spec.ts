// tests/e2e/items.spec.ts
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './support';

test.beforeEach(async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
});

async function show(page: Page, month = '01') {
  await page.getByLabel('Company Code', { exact: true }).fill('1000');
  await page.getByLabel('Period', { exact: true }).selectOption(month);
  await page.getByLabel('Period year').fill('2026');
  await page.getByRole('button', { name: 'Show' }).click();
}

test('totals per currency update while typing; F4 in a grid cell; save after review', async ({ page }) => {
  await page.goto('/samples/monthly-amounts');
  await show(page);
  const grid = page.getByRole('table', { name: 'Monthly Amounts' });
  await expect(grid.locator('tbody tr')).toHaveCount(5);
  const totals = grid.locator('tfoot tr');
  await expect(totals).toHaveCount(2);
  await expect(totals.nth(0)).toContainText('INR');
  await expect(totals.nth(0)).toContainText('1,25,402.00');
  await expect(totals.nth(1)).toContainText('USD');
  await expect(totals.nth(1)).toContainText('62,600.50');
  await grid.getByLabel('Amount *, row 1', { exact: true }).fill('12600.00');
  await expect(totals.nth(0)).toContainText('1,25,401.50');
  await expect(totals.nth(1)).toContainText('62,600.50');

  await page.getByRole('button', { name: 'Add Row' }).click();
  const gl = grid.getByLabel('GL Account *, row 6', { exact: true });
  await expect(gl).toBeFocused();
  await gl.press('F4');
  const f4 = page.getByRole('dialog', { name: 'Select GL Account' });
  await f4.getByPlaceholder('Search code or text').fill('Depreciation');
  await page.keyboard.press('Enter');
  await expect(f4).toBeHidden();
  await expect(gl).toHaveValue('600100');
  await grid.getByLabel('Amount *, row 6', { exact: true }).fill('1000');
  await grid.getByLabel('Currency *, row 6', { exact: true }).fill('INR');
  await expect(totals.nth(0)).toContainText('1,26,401.50');

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Save Monthly Amounts' });
  await expect(review).toContainText('1 changed, 1 new');
  await review.getByRole('button', { name: 'Yes, Save Changes' }).click();
  await expect(page.locator('.ds-toast')).toHaveText('Saved: 1 changed, 1 new');
  await expect(grid.locator('tbody tr')).toHaveCount(6);

  await page.reload();
  await expect(page.getByLabel('Company Code', { exact: true })).toHaveValue('1000');
});

test('showing another selection with unsaved changes asks first', async ({ page }) => {
  await page.goto('/samples/monthly-amounts');
  await show(page);
  const grid = page.getByRole('table', { name: 'Monthly Amounts' });
  await grid.getByLabel('Amount *, row 1', { exact: true }).fill('1');
  await page.getByLabel('Period', { exact: true }).selectOption('02');
  await page.getByRole('button', { name: 'Show' }).click();
  const ask = page.getByRole('dialog', { name: 'Discard changes?' });
  await expect(ask).toContainText('1 changed');
  await ask.getByRole('button', { name: 'Yes, Discard' }).click();
  await expect(grid.getByLabel('Amount *, row 1', { exact: true })).toHaveValue('12,700.50');
});
