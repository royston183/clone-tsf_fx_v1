// tests/e2e/gallery.spec.ts
import { expect, test } from '@playwright/test';
import { signIn } from './support';
import { GALLERY_ITEMS } from '../../src/components/gallery/ids';

test.beforeEach(async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
  await page.goto('/gallery');
});

test('lists every field type with its ID', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'UI Gallery' })).toBeVisible();
  for (const id of ['F-text', 'F-amount', 'F-date', 'F-dateRange', 'F-period', 'F-suggest', 'F-file', 'D-form', 'D-valuehelp', 'B-toast']) {
    await expect(page.locator(`[data-gallery-id="${id}"]`)).toBeVisible();
  }
});

test('shows every item of the Gallery id list once, with its title', async ({ page }) => {
  for (const item of GALLERY_ITEMS) {
    const card = page.locator(`[data-gallery-id="${item.id}"]`);
    await expect(card).toHaveCount(1);
    await expect(card.locator(':scope > h3')).toContainText(item.title);
  }
});

test('breadcrumb reads UI Gallery and IDs show exactly as written', async ({ page }) => {
  await expect(page.locator('.topbar').getByRole('navigation', { name: 'Breadcrumb' })).toContainText('UI Gallery');
  await expect(page.locator('[data-gallery-id="F-text"] .kit-id')).toHaveText('F-text');
});

test('an amount formats on blur and is right-aligned', async ({ page }) => {
  const amount = page.locator('[data-gallery-id="F-amount"] input').first();
  await amount.fill('1234567.5');
  await amount.blur();
  await expect(amount).toHaveValue('12,34,567.50');
  await expect(amount).toHaveCSS('text-align', 'right');
});

test('form dialog: Save shows problems, Esc closes and focus returns', async ({ page }) => {
  const open = page.getByRole('button', { name: 'Open 1 column' });
  await open.click();
  const dialog = page.getByRole('dialog', { name: 'Create Deal' });
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByText('Fix the highlighted fields to save')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(open).toBeFocused();
});

test('the 1-column form dialog puts focus in its first field', async ({ page }) => {
  await page.getByRole('button', { name: 'Open 1 column' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create Deal' });
  await expect(dialog.getByLabel('Deal', { exact: true })).toBeFocused();
});

test('F4 inside the form picks a currency and Esc closes only the value help', async ({ page }) => {
  await page.getByRole('button', { name: 'Open 1 column' }).click();
  const form = page.getByRole('dialog', { name: 'Create Deal' });
  await form.getByRole('button', { name: 'Search Currency' }).click();
  const f4 = page.getByRole('dialog', { name: 'Select Currency' });
  await f4.getByPlaceholder('Search code or text').fill('dollar');
  await page.keyboard.press('Escape');
  await expect(f4).toBeHidden();
  await expect(form).toBeVisible();
  await form.getByRole('button', { name: 'Search Currency' }).click();
  await f4.getByPlaceholder('Search code or text').fill('rupee');
  await page.keyboard.press('Enter');
  await expect(form.getByLabel('Currency', { exact: true })).toHaveValue('INR');
});

test('with the value help open, Ctrl+S does not reach the form underneath', async ({ page }) => {
  await page.getByRole('button', { name: 'Open 1 column' }).click();
  const form = page.getByRole('dialog', { name: 'Create Deal' });
  await form.getByRole('button', { name: 'Search Currency' }).click();
  const f4 = page.getByRole('dialog', { name: 'Select Currency' });
  await expect(f4).toBeVisible();
  await page.keyboard.press('Control+s');
  await expect(f4).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(f4).toBeHidden();
  await expect(form).toBeVisible();
  await expect(form.getByText('Fix the highlighted fields to save')).toHaveCount(0);
});

test('the file drop zone opens the file chooser from the keyboard', async ({ page }) => {
  const zone = page.locator('[data-gallery-id="F-file"]').getByRole('button', { name: 'Choose Upload File file' }).first();
  const chooser = page.waitForEvent('filechooser');
  await zone.press('Enter');
  expect(await chooser).toBeTruthy();
});

test('clicking into a text field keeps the text and places the caret', async ({ page }) => {
  const input = page.locator('[data-gallery-id="F-text"] input').first();
  await input.click({ position: { x: 20, y: 10 } });
  await page.keyboard.type('Z');
  const v = await input.inputValue();
  expect(v).toContain('Z');
  expect(v.replace('Z', '')).toBe('Term loan to ABC Ltd');
});

test('review dialog lists only changed fields', async ({ page }) => {
  await page.getByRole('button', { name: 'Review' }).click();
  const rows = page.getByRole('dialog', { name: 'Confirm Update' }).locator('tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('30,00,000.00');
});

test('confirm posts and shows a toast', async ({ page }) => {
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  await page.getByRole('button', { name: 'Yes, Post' }).click();
  await expect(page.locator('.ds-toast.success')).toHaveText('Posted');
});

test('drawer opens, widens and closes with Esc', async ({ page }) => {
  await page.getByRole('button', { name: 'Open drawer' }).click();
  // Closed, the drawer is aria-hidden, so it is located by class rather than by role.
  const drawer = page.locator('aside.ov-drawer');
  await expect(drawer).toHaveClass(/open/);
  await drawer.getByRole('button', { name: 'Widen' }).click();
  await expect(drawer).toHaveClass(/wide/);
  await page.keyboard.press('Escape');
  await expect(drawer).not.toHaveClass(/open/);
});

test('upload preview counts the valid rows', async ({ page }) => {
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Upload Budget' });
  await dialog.locator('input[type=file]').setInputFiles({ name: 'budget.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('x') });
  await expect(dialog.getByText('2 of 3 rows ready')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Post 2 Rows' })).toBeEnabled();
});

test('delete dialog: Enter confirms, Enter on Cancel cancels', async ({ page }) => {
  await page.getByRole('button', { name: 'Delete 2' }).click();
  await expect(page.getByRole('dialog', { name: 'Delete Time Buckets' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.ds-toast.success')).toHaveText('2 entries deleted');
  await page.getByRole('button', { name: 'Delete 2' }).click();
  await page.getByRole('button', { name: 'Cancel' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Delete Time Buckets' })).toHaveCount(0);
});
