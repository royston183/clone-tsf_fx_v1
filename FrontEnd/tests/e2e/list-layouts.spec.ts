// tests/e2e/list-layouts.spec.ts
import { expect, test, type Page } from '@playwright/test';
import { appData, HAS_BACKEND, NETWORK_ONLY, signIn } from './support';

test.beforeEach(async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
});
const pager = (page: Page) => page.locator('.kit-pager .pagination > span').first();
const head = (page: Page) => page.locator('section.ds-app .kit-list table.ds-table thead');
const firstRow = (page: Page) => page.locator('section.ds-app .kit-list table.ds-table tbody tr').first();
const picked = (page: Page) => page.getByLabel('Layout', { exact: true }).locator('option:checked');

test('large list layouts: hide a column, sort and page size, save a personal default, reload, delete', async ({ page }) => {
  test.skip(!HAS_BACKEND, NETWORK_ONLY);
  await page.goto('/samples/deals');
  await expect(pager(page)).toHaveText('1–50 of 2,000');
  await page.getByRole('button', { name: 'Change Layout' }).click();
  const change = page.getByRole('dialog', { name: 'Change Layout' });
  await expect(change.getByRole('tab', { name: 'Subtotals' })).toHaveCount(0);
  await change.getByRole('option', { name: 'Counterparty', exact: true }).click();
  await change.getByRole('button', { name: 'Hide the selected column' }).click();
  await change.getByRole('tab', { name: 'Sort Order' }).click();
  await change.getByRole('button', { name: 'Remove Deal' }).click();
  await change.getByLabel('Column to add').selectOption('amount');
  await change.getByRole('button', { name: 'Add' }).click();
  await change.getByRole('radio', { name: 'Descending' }).click();
  await change.getByRole('tab', { name: 'Display', exact: true }).click();
  await change.getByLabel('Rows per page').selectOption('100');
  await change.getByRole('button', { name: 'OK' }).click();
  await expect(pager(page)).toHaveText('1–100 of 2,000');
  await expect(head(page)).not.toContainText('Counterparty');
  await expect(firstRow(page).locator('td').nth(3)).toHaveText(/^[\d,]+\.00$/);
  await expect(picked(page)).toHaveText('Standard layout *');

  await page.getByRole('button', { name: 'Save Layout', exact: true }).click();
  const save = page.getByRole('dialog', { name: 'Save Layout' });
  await save.getByLabel('Layout name').fill('Big first');
  await save.getByRole('radio', { name: 'Only me' }).click();
  await save.getByLabel('Default layout (opens with the screen)').check();
  await save.getByRole('button', { name: 'Save Layout' }).click();
  await expect(picked(page)).toHaveText('Big first (default)');
  // With a default layout the list reads SAP once on open, with that layout's sort and page size.
  const queries: string[] = [];
  page.on('request', r => { if (r.method() === 'POST' && new URL(r.url()).pathname === '/api/modules/sample-deals/deals/query') queries.push(r.postData() ?? ''); });
  await page.reload();
  await expect(picked(page)).toHaveText('Big first (default)');
  await expect(pager(page)).toHaveText('1–100 of 2,000');
  expect(queries).toHaveLength(1);
  expect(queries[0]).toContain('"pageSize":100');
  await expect(head(page)).not.toContainText('Counterparty');

  await page.getByRole('button', { name: 'Delete layout' }).click();
  await page.getByRole('dialog', { name: 'Delete layout' }).getByRole('button', { name: 'Yes, Delete' }).click();
  await expect(picked(page)).toHaveText('Standard layout');
  await expect(pager(page)).toHaveText('1–50 of 2,000');
  await expect(head(page)).toContainText('Counterparty');
  await expect(firstRow(page).locator('td').first()).toHaveText('0000012000');
});

test('deleting a layout that is already gone falls back to the Standard layout; picking a layout clears the error', async ({ page }) => {
  const drop = () => appData(page, 'layoutsRemove', 'sample-deals', 'Gone soon', 'personal').catch(() => undefined);
  try {
    await page.goto('/samples/deals');
    await expect(pager(page)).toHaveText('1–50 of 2,000');
    await page.getByRole('button', { name: 'Save Layout', exact: true }).click();
    const save = page.getByRole('dialog', { name: 'Save Layout' });
    await save.getByLabel('Layout name').fill('Gone soon');
    await save.getByRole('radio', { name: 'Only me' }).click();
    await save.getByRole('button', { name: 'Save Layout' }).click();
    await expect(picked(page)).toHaveText('Gone soon');
    await drop();
    await page.getByRole('button', { name: 'Delete layout' }).click();
    await page.getByRole('dialog', { name: 'Delete layout' }).getByRole('button', { name: 'Yes, Delete' }).click();
    await expect(page.getByRole('alert').filter({ hasText: "Layout 'Gone soon' does not exist." })).toBeVisible();
    await expect(picked(page)).toHaveText('Standard layout');
    await expect(page.getByLabel('Layout', { exact: true }).locator('option', { hasText: 'Gone soon' })).toHaveCount(0);
    await page.getByLabel('Layout', { exact: true }).selectOption({ label: 'Standard layout' });
    await expect(page.getByRole('alert').filter({ hasText: 'does not exist' })).toHaveCount(0);
  } finally {
    await drop();
  }
});
