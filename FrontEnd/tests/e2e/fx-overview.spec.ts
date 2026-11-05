import { expect, test } from '@playwright/test';
import { signIn } from './support';

test('FX Overview loads all sections, changes its date and opens the full report', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await signIn(page);
  const headers = { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  await page.route('**/api/modules/master-contract/contracts/query', route => route.fulfill({ status: 200, headers, body: JSON.stringify({ rows: [], total: 0, page: 1, pageSize: 500 }) }));
  await page.route('**/zfs_sb_tsfdeal_o4_api/**', route => route.fulfill({ status: 200, headers, body: JSON.stringify({ value: [] }) }));
  await page.goto('/');
  const figures = page.getByRole('region', { name: 'Key figures', exact: true });
  await expect(figures.locator('article')).toHaveCount(5);
  await expect(page.getByRole('region', { name: 'Master contract lifecycle', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Change key date', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Change key date', exact: true });
  await dialog.getByLabel('Key date', { exact: true }).fill('2026-11-05');
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Key date', exact: true })).toContainText('05-11-2026');
  await page.getByRole('group', { name: 'Amount unit', exact: true }).getByRole('button', { name: 'Actual', exact: true }).click();
  await expect(figures.locator('article')).toHaveCount(5);
  await page.getByRole('link', { name: /Open full report/ }).click();
  await expect(page).toHaveURL(/\/reporting\/view-tsf-deals/);
  expect(errors).toEqual([]);
});
