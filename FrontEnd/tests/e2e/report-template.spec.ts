import { expect, test } from '@playwright/test';
import { signIn } from './support';

test.beforeEach(async ({ page }) => { await signIn(page); await expect(page.getByRole('heading', { level: 1, name: 'Overview', exact: true })).toBeVisible(); });

test('selections collapse before and after a run, preserve drafts and leave report results visible', async ({ page }) => {
  await page.goto('/samples/cash-flow-lines');
  const selection = page.getByRole('region', { name: 'Report selections', exact: true });
  const overview = page.getByRole('region', { name: 'Report overview', exact: true });
  await expect(overview).toContainText('Awaiting run');
  await selection.getByLabel('Company Code', { exact: true }).fill('1000');
  await selection.getByLabel('Period', { exact: true }).selectOption('01');
  await selection.getByLabel('Period year').fill('2026');
  await selection.getByRole('button', { name: 'Hide selection' }).click();
  await expect(selection.getByLabel('Company Code', { exact: true })).toBeHidden();
  await expect(selection).toContainText('1000');
  await selection.getByRole('button', { name: 'Change selection' }).click();
  await expect(selection.getByLabel('Company Code', { exact: true })).toHaveValue('1000');
  await selection.getByRole('button', { name: 'Run', exact: true }).click();
  const table = page.getByRole('table', { name: 'Cash Flow Lines' });
  await expect(table).toBeVisible();
  await expect(overview.locator('.kit-status.green')).toHaveText('Ready');
  await expect(overview).toContainText('20 rows');
  await selection.getByRole('button', { name: 'Hide selection' }).click();
  await expect(table).toBeVisible();
  await selection.getByRole('button', { name: 'Change selection' }).focus();
  await page.keyboard.press('Enter');
  await expect(selection.getByLabel('Company Code', { exact: true })).toHaveValue('1000');
  // Layout is the final, right-aligned group even when the toolbar wraps.
  const layout = page.getByRole('group', { name: 'Layout options', exact: true });
  const toolbar = layout.locator('..');
  const [groupBox, toolbarBox] = await Promise.all([layout.boundingBox(), toolbar.boundingBox()]);
  expect(Math.abs(groupBox!.x + groupBox!.width - (toolbarBox!.x + toolbarBox!.width - 18))).toBeLessThan(24);
  await page.screenshot({ path: test.info().outputPath('report-light.png'), fullPage: true });
  await page.getByRole('button', { name: /Night/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: test.info().outputPath('report-dark.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(layout).toBeVisible();
  await expect(overview).toBeVisible();
  await page.getByRole('button', { name: 'Change Layout', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Change Layout', exact: true });
  const bounds = await modal.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await expect(modal.getByRole('region', { name: 'Displayed Columns', exact: true })).toBeVisible();
  await modal.screenshot({ path: test.info().outputPath('layout-mobile-dark.png') });
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
  await expect(page.getByRole('button', { name: 'Change Layout', exact: true })).toBeFocused();
});

test('dashboard inputs are independent and collapsible, with a connected overview', async ({ page }) => {
  await page.goto('/samples/treasury-overview?s.company=1000&s.month=01&s.year=2026');
  const selection = page.getByRole('region', { name: 'Report selections', exact: true });
  await expect(page.getByRole('region', { name: 'Report overview', exact: true })).toBeVisible();
  await expect(selection).toBeVisible();
  await selection.getByRole('button', { name: 'Hide selection' }).click();
  await expect(selection.getByRole('button', { name: 'Change selection' })).toHaveAttribute('aria-expanded', 'false');
  await expect(selection.getByRole('button', { name: 'Show', exact: true })).toBeHidden();
  await selection.getByRole('button', { name: 'Change selection' }).click();
  await expect(selection.getByLabel('Company Code', { exact: true })).toHaveValue('1000');
});

test('upload wizard has input sections, real progress and green, amber and red row tags', async ({ page }) => {
  await page.goto('/gallery');
  await page.locator('[data-gallery-id="D-upload"]').getByRole('button', { name: 'Upload', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Upload Budget', exact: true });
  await expect(modal.getByRole('list', { name: 'Progress' }).locator('[aria-current="step"]')).toHaveText('1Choose file');
  await expect(modal.getByRole('region', { name: 'Source file', exact: true })).toBeVisible();
  await modal.locator('input[type="file"]').setInputFiles({ name: 'budget.csv', mimeType: 'text/csv', buffer: Buffer.from('gl,amount\n400100,125000') });
  await expect(modal.getByRole('region', { name: 'Review entries', exact: true })).toBeVisible();
  await expect(modal.getByRole('list', { name: 'Progress' }).locator('[aria-current="step"]')).toHaveText('2Review rows');
  await expect(modal.locator('.kit-status.green')).toHaveText('New');
  await expect(modal.locator('.kit-status.amber')).toHaveText('Update');
  await expect(modal.locator('.kit-status.red')).toHaveText('Invalid');
  await expect(modal.getByRole('button', { name: 'Post 2 Rows' })).toBeEnabled();
  await modal.screenshot({ path: test.info().outputPath('upload-wizard.png') });
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
  await expect(page.locator('[data-gallery-id="D-upload"]').getByRole('button', { name: 'Upload', exact: true })).toBeFocused();
});
