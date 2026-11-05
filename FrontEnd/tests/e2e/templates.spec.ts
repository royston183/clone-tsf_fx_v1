// tests/e2e/templates.spec.ts
import { expect, test, type Page } from '@playwright/test';
import { appData, HAS_BACKEND, NETWORK_ONLY, signIn } from './support';

// Each test works on its own seeded deal (or creates its own), so any test can run alone; the run starts from the seed.
test.beforeEach(async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
});
const listRows = (page: Page) => page.locator('section.ds-app .kit-list table.ds-table tbody tr');
const pager = (page: Page) => page.locator('.kit-pager .pagination > span').first();
const toast = (page: Page) => page.locator('.ds-toast');

/** A deal created through the application's API, for tests that must not touch seeded deals. */
async function createDeal(page: Page, name: string): Promise<string> {
  const created = await appData<{ header: { deal: string } }>(page, 'objectWrite', 'sample-deals', 'create', {
    header: { name, product: '51A', counterparty: 'CP003', amount: '1000000', currency: 'INR', start: '2026-04-01', end: '2031-03-31' },
    items: { flows: [{ seq: '1', payDate: '2026-10-01', flowType: 'INT', amount: '75000', currency: 'INR' }] }
  });
  return created.header.deal;
}

test('the Gallery lists the four templates', async ({ page }) => {
  await page.goto('/gallery');
  for (const id of ['T-large-list', 'T-object', 'T-items', 'T-upload']) await expect(page.locator(`[data-gallery-id="${id}"]`)).toBeVisible();
});

test('the Samples page is in the rail and the Templates section links to the Deals sample', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.sidebar').getByRole('link', { name: 'Samples' })).toHaveCount(1);
  await page.goto('/gallery');
  await expect(page.locator('[data-gallery-id="T-large-list"]').getByRole('link', { name: 'Open the list' })).toHaveAttribute('href', '/samples/deals');
  await page.locator('[data-gallery-id="T-object"]').getByRole('link', { name: 'Open deal 0000010001' }).click();
  await expect(page).toHaveURL(/\/samples\/deals\?open=0000010001$/);
  await expect(page.getByRole('dialog', { name: 'Deal 0000010001' })).toBeVisible();
});

test('large list: pages, sorts, filters and searches on the server', async ({ page }) => {
  await page.goto('/samples/deals');
  await expect(pager(page)).toHaveText('1–50 of 2,000');
  await expect(listRows(page)).toHaveCount(50);
  await expect(listRows(page).first().locator('td').first()).toHaveText('0000012000');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(pager(page)).toHaveText('51–100 of 2,000');
  await page.getByLabel('Rows per page').selectOption('100');
  await expect(pager(page)).toHaveText('1–100 of 2,000');
  await page.getByRole('button', { name: 'Deal', exact: true }).click();
  await expect(listRows(page).first().locator('td').first()).toHaveText('0000010001');
  const product = page.getByLabel('All Product Type');
  await product.fill('52A');
  await product.press('ArrowDown');
  await product.press('Enter');
  await expect(listRows(page).first().locator('td').nth(2)).toHaveText('52A Fixed Deposit');
  await expect(pager(page)).not.toHaveText(/of 2,000$/);
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill("O'Brien");
  await expect(listRows(page).first().locator('td').nth(1)).toContainText("O'Brien Capital");
  const names = await listRows(page).locator('td:nth-child(2)').allTextContents();
  expect(names.length).toBeGreaterThan(0);
  expect(names.every(n => n.includes("O'Brien"))).toBe(true);
});

test('large list: a typed amount range with sorting by amount, across pages', async ({ page }) => {
  await page.goto('/samples/deals');
  await expect(pager(page)).toHaveText('1–50 of 2,000');
  await page.getByLabel('Amount from').fill('8000000');
  await expect(pager(page)).not.toHaveText(/of 2,000$/);
  const amounts = async () => (await listRows(page).locator('td:nth-child(5)').allTextContents()).map(t => Number(t.replace(/,/g, '')));
  const ascending = (xs: number[]) => xs.every((x, i) => i === 0 || xs[i - 1] <= x);
  await page.getByRole('button', { name: 'Amount', exact: true }).click();
  await expect.poll(async () => { const a = await amounts(); return a.length > 0 && a.every(x => x >= 8000000) && ascending(a); }).toBe(true);
  const first = await amounts();
  const range = (await pager(page).textContent()) ?? '';
  const total = Number(range.replace(/^.* of /, '').replace(/,/g, ''));
  expect(total).toBeGreaterThan(50);
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(pager(page)).toHaveText(new RegExp(`^51–${Math.min(100, total)} of `));
  await expect.poll(async () => { const a = await amounts(); return a.length > 0 && ascending(a) && a[0] >= first[first.length - 1]; }).toBe(true);
  const second = await amounts();
  await page.getByRole('button', { name: 'Amount', exact: true }).click();
  await expect(pager(page)).toHaveText(/^1–50 of /);
  await expect.poll(async () => { const a = await amounts(); return a.length > 0 && a[0] >= second[second.length - 1] && a.every((x, i) => i === 0 || a[i - 1] >= x); }).toBe(true);
});

test('?open= opens a deal, Back closes it, and a stale link says so', async ({ page }) => {
  await page.goto('/samples/deals');
  await listRows(page).first().click();
  await expect(page).toHaveURL(/\?open=0000012000$/);
  const dialog = page.getByRole('dialog', { name: 'Deal 0000012000' });
  await expect(dialog.locator('.kit-facts')).toContainText('0000012000');
  await page.goBack();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/samples\/deals$/);
  await page.goto('/samples/deals?open=0000010001');
  await expect(page.getByRole('dialog', { name: 'Deal 0000010001' })).toBeVisible();
  await page.goto('/samples/deals?open=0000099999');
  const missing = page.getByRole('dialog', { name: 'Deal not available' });
  await expect(missing).toContainText('Deal 0000099999 no longer exists.');
  await missing.getByRole('button', { name: 'Close' }).last().click();
  await expect(missing).toBeHidden();
  await expect(page).toHaveURL(/\/samples\/deals$/);
});

test('a deep link opens the deal and browser Back closes it', async ({ page }) => {
  await page.goto('/samples/deals');
  await expect(pager(page)).toHaveText('1–50 of 2,000');
  await page.goto('/samples/deals?open=0000010005');
  const dialog = page.getByRole('dialog', { name: 'Deal 0000010005' });
  await expect(dialog.locator('.kit-facts')).toContainText('0000010005');
  await page.goBack();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/samples\/deals$/);
});

test('Back with unsaved header and item edits asks first; Cancel keeps them, Discard closes', async ({ page }) => {
  await page.goto('/samples/deals');
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('0000010003');
  await expect(listRows(page)).toHaveCount(1);
  await listRows(page).first().click();
  await expect(page).toHaveURL(/[?&]open=0000010003$/);
  await page.getByRole('dialog', { name: 'Deal 0000010003' }).getByRole('button', { name: 'Edit' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit Deal 0000010003' });
  await edit.getByLabel('Deal Name', { exact: true }).fill('Edited, not saved');
  await edit.getByRole('tab', { name: 'Cash Flows' }).click();
  await edit.getByLabel('Amount *, row 1', { exact: true }).fill('4321');
  await page.goBack();
  const ask = page.getByRole('dialog', { name: 'Discard changes?' });
  await expect(ask).toBeVisible();
  await expect(page).toHaveURL(/[?&]open=0000010003$/);
  await ask.getByRole('button', { name: 'Cancel' }).click();
  await expect(ask).toBeHidden();
  await expect(edit.getByLabel('Amount *, row 1', { exact: true })).toHaveValue(/4,?321/);
  await edit.getByRole('tab', { name: 'Basic Data' }).click();
  await expect(edit.getByLabel('Deal Name', { exact: true })).toHaveValue('Edited, not saved');
  await page.goBack();
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: 'Yes, Discard' }).click();
  await expect(edit).toBeHidden();
  await expect(page).toHaveURL(/\/samples\/deals$/);
  await expect(page).not.toHaveURL(/open=/);
  await expect(listRows(page).first()).toContainText('0000010003');
  await expect(listRows(page).first()).not.toContainText('Edited, not saved');
});

test('closing with X goes back: Forward reopens the deal and no list entry is duplicated', async ({ page }) => {
  await page.goto('/samples/deals');
  await expect(pager(page)).toHaveText('1–50 of 2,000');
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('0000010004');
  await expect(listRows(page)).toHaveCount(1);
  await listRows(page).first().click();
  const dialog = page.getByRole('dialog', { name: 'Deal 0000010004' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).first().click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/samples\/deals$/);
  await page.goForward();
  await expect(page).toHaveURL(/\?open=0000010004$/);
  await expect(dialog).toBeVisible();
  await page.goBack();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/samples\/deals$/);
  // One more Back leaves the list: the page before the deal list, not a second list entry.
  await page.goBack();
  await expect(page).not.toHaveURL(/\/samples\/deals/);
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
});

test('New: Back with typed values asks first; an untouched New closes on Back', async ({ page }) => {
  await page.goto('/samples/deals');
  await expect(pager(page)).toHaveText('1–50 of 2,000');
  await page.getByRole('button', { name: 'New Deal' }).click();
  const dialog = page.getByRole('dialog', { name: 'New Deal' });
  await expect(dialog).toBeVisible();
  await page.goBack();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'Discard changes?' })).toHaveCount(0);
  await expect(page).toHaveURL(/\/samples\/deals$/);
  await page.getByRole('button', { name: 'New Deal' }).click();
  await dialog.getByLabel('Deal Name', { exact: true }).fill('Typed then abandoned');
  await page.goBack();
  const ask = page.getByRole('dialog', { name: 'Discard changes?' });
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog.getByLabel('Deal Name', { exact: true })).toHaveValue('Typed then abandoned');
  await page.goBack();
  await ask.getByRole('button', { name: 'Yes, Discard' }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/samples\/deals$/);
  await expect(pager(page)).toHaveText('1–50 of 2,000');
});

test('edit, review and save a deal; the list shows the change', async ({ page }) => {
  await page.goto('/samples/deals?open=0000010001');
  await page.getByRole('dialog', { name: 'Deal 0000010001' }).getByRole('button', { name: 'Edit' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit Deal 0000010001' });
  await edit.getByLabel('Deal Name', { exact: true }).fill('Renamed by e2e');
  await edit.getByRole('tab', { name: 'Cash Flows' }).click();
  await edit.getByLabel('Amount *, row 1', { exact: true }).fill('12345');
  await edit.getByRole('button', { name: 'Save', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Save Deal 0000010001' });
  await expect(review.getByRole('cell', { name: 'Renamed by e2e' })).toBeVisible();
  await expect(review).toContainText('Cash Flows: 1 changed');
  await review.getByRole('button', { name: 'Yes, Save Changes' }).click();
  await expect(toast(page)).toHaveText('Deal saved');
  const shown = page.getByRole('dialog', { name: 'Deal 0000010001' });
  await expect(shown.locator('.kit-facts')).toContainText('Renamed by e2e');
  await shown.getByRole('tab', { name: 'Cash Flows' }).click();
  await expect(shown.getByRole('tabpanel')).toContainText('12,345.00');
  await shown.getByRole('button', { name: 'Close' }).last().click();
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('Renamed by e2e');
  await expect(listRows(page)).toHaveCount(1);
  await expect(listRows(page).first()).toContainText('0000010001');
});

test('a 422 from the server shows on the header field and on the item row', async ({ page }) => {
  test.skip(!HAS_BACKEND, NETWORK_ONLY);
  await page.route('**/api/modules/sample-deals/object', async route => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    await route.fulfill({
      status: 422, contentType: 'application/json',
      body: JSON.stringify({ error: { message: 'SAP did not accept the deal.', details: [
        { field: 'name', message: 'Deal Name is already used by another deal.' },
        { tab: 'flows', row: 1, field: 'amount', message: 'Amount exceeds the deal amount.' }
      ] } })
    });
  });
  await page.goto('/samples/deals?open=0000010006');
  await page.getByRole('dialog', { name: 'Deal 0000010006' }).getByRole('button', { name: 'Edit' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit Deal 0000010006' });
  await edit.getByLabel('Deal Name', { exact: true }).fill('Duplicate name');
  await edit.getByRole('tab', { name: 'Cash Flows' }).click();
  await edit.getByLabel('Amount *, row 1', { exact: true }).fill('999');
  await edit.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('dialog', { name: 'Save Deal 0000010006' }).getByRole('button', { name: 'Yes, Save Changes' }).click();
  await expect(edit).toContainText('SAP did not accept the deal.');
  await expect(edit.getByRole('tab', { name: 'Cash Flows' })).toHaveClass(/kit-tab-bad/);
  await expect(edit.getByLabel('Amount *, row 1', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(edit.locator('tr.ds-row-msg')).toHaveText('Amount exceeds the deal amount.');
  // The header form opens the first tab, which is marked too; the field's accessible name carries the problem.
  await expect(edit.getByRole('tab', { name: 'Basic Data' })).toHaveClass(/kit-tab-bad/);
  await edit.getByRole('tab', { name: 'Basic Data' }).click();
  const name = edit.getByRole('textbox', { name: /^Deal Name/ });
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  await expect(edit).toContainText('Deal Name is already used by another deal.');
  // The edits stay; nothing was saved.
  await expect(name).toHaveValue('Duplicate name');
});

test('create a deal; the number is assigned on save', async ({ page }) => {
  await page.goto('/samples/deals');
  await page.getByRole('button', { name: 'New Deal' }).click();
  const dialog = page.getByRole('dialog', { name: 'New Deal' });
  await expect(dialog.getByLabel('Deal', { exact: true })).toHaveCount(0);
  await dialog.getByLabel('Deal Name', { exact: true }).fill('E2E created deal');
  await dialog.getByLabel('Counterparty', { exact: true }).fill('CP003');
  await dialog.getByLabel('Amount', { exact: true }).fill('2500000');
  await dialog.getByLabel('Validity from').fill('2026-04-01');
  await dialog.getByLabel('Validity to').fill('2031-03-31');
  await dialog.getByRole('tab', { name: 'Cash Flows' }).click();
  await dialog.getByRole('button', { name: 'Add Row' }).click();
  await expect(dialog.getByLabel('No. *, row 1', { exact: true })).toHaveValue('1');
  await dialog.getByLabel('Payment Date', { exact: true }).fill('2026-10-01');
  await dialog.getByLabel('Flow Type *, row 1', { exact: true }).selectOption('INT');
  await dialog.getByLabel('Amount *, row 1', { exact: true }).fill('187500');
  await dialog.getByLabel('Currency *, row 1', { exact: true }).fill('INR');
  await dialog.getByRole('button', { name: 'Create Deal' }).click();
  await expect(toast(page)).toHaveText('Deal 0000012001 created');
  await expect(page).toHaveURL(/\?open=0000012001$/);
  await expect(page.getByRole('dialog', { name: 'Deal 0000012001' })).toBeVisible();
});

test('delete a deal after confirming', async ({ page }) => {
  await page.goto('/samples/deals');
  const deal = await createDeal(page, 'E2E deal to delete');
  await page.goto(`/samples/deals?open=${deal}`);
  const dialog = page.getByRole('dialog', { name: `Deal ${deal}` });
  await dialog.getByRole('button', { name: 'Delete' }).click();
  const confirm = page.getByRole('dialog', { name: 'Delete Deal' });
  await expect(confirm).toContainText(`Delete deal ${deal}? This cannot be undone.`);
  await confirm.getByRole('button', { name: 'Yes, Delete' }).click();
  await expect(toast(page)).toHaveText('Deal deleted');
  await expect(dialog).toBeHidden();
  await expect(page).not.toHaveURL(/open=/);
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('E2E deal to delete');
  await expect(page.locator('section.ds-app .kit-list .empty')).toContainText('No deals match the current filters');
  await page.goto(`/samples/deals?open=${deal}`);
  await expect(page.getByRole('dialog', { name: 'Deal not available' })).toContainText(`Deal ${deal} no longer exists.`);
});

test('the Release action asks first, then releases the deal', async ({ page }) => {
  await page.goto('/samples/deals?open=0000010007');
  const dialog = page.getByRole('dialog', { name: 'Deal 0000010007' });
  await expect(dialog.getByRole('tabpanel')).toContainText('New');
  await dialog.getByRole('button', { name: 'Release', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Release' });
  await expect(confirm).toContainText('Release this deal? A released deal is ready for posting.');
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirm).toBeHidden();
  await dialog.getByRole('button', { name: 'Release', exact: true }).click();
  await confirm.getByRole('button', { name: 'Yes, Release' }).click();
  await expect(toast(page)).toHaveText('Release: done');
  await expect(dialog.getByRole('tabpanel')).toContainText('Released');
  await expect(dialog.getByRole('button', { name: 'Release', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Close' }).last().click();
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('0000010007');
  await expect(listRows(page).first().locator('td').last()).toHaveText('Released');
});

test('leaving edit mode with changes asks first', async ({ page }) => {
  await page.goto('/samples/deals?open=0000010002');
  await page.getByRole('dialog', { name: 'Deal 0000010002' }).getByRole('button', { name: 'Edit' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit Deal 0000010002' });
  await edit.getByLabel('Deal Name', { exact: true }).fill('Not saved');
  await page.keyboard.press('Escape');
  const ask = page.getByRole('dialog', { name: 'Discard changes?' });
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: 'Cancel' }).click();
  await expect(edit.getByLabel('Deal Name', { exact: true })).toHaveValue('Not saved');
  await edit.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('dialog', { name: 'Discard changes?' }).getByRole('button', { name: 'Yes, Discard' }).click();
  const shown = page.getByRole('dialog', { name: 'Deal 0000010002' });
  await expect(shown).toBeVisible();
  await expect(shown.locator('.kit-facts')).not.toContainText('Not saved');
});

test('the record pop-up: key facts, a dash for an empty value, arrow keys between tabs, Save disabled while a field needs fixing', async ({ page }) => {
  await page.goto('/samples/deals?open=0000010004');
  const dialog = page.getByRole('dialog', { name: 'Deal 0000010004' });
  await expect(dialog.locator('.kit-facts')).toContainText('0000010004');
  const remarks = dialog.locator('.kit-dl dt', { hasText: 'Remarks' }).locator('xpath=following-sibling::dd[1]');
  await expect(remarks).toHaveText('—');
  const basic = dialog.getByRole('tab', { name: 'Basic Data' });
  await basic.focus();
  await page.keyboard.press('ArrowRight');
  const flows = dialog.getByRole('tab', { name: 'Cash Flows' });
  await expect(flows).toBeFocused();
  await expect(flows).toHaveAttribute('aria-selected', 'true');
  await expect(dialog.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', await flows.getAttribute('id') ?? '');
  await page.keyboard.press('ArrowRight');
  await expect(basic).toBeFocused();
  await dialog.getByRole('button', { name: 'Edit' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit Deal 0000010004' });
  const save = edit.getByRole('button', { name: 'Save', exact: true });
  await expect(edit.locator('.ds-foot-hint')).toHaveText('No changes yet · Ctrl+S saves');
  await edit.getByLabel('Deal Name', { exact: true }).fill('');
  await expect(edit.locator('.ds-foot-hint')).toHaveText('1 change · 1 field to fix');
  await expect(save).toBeDisabled();
  // The field's name now carries its problem ("Deal Name is required.").
  await edit.getByRole('textbox', { name: /^Deal Name/ }).fill('Fixed again');
  await expect(edit.locator('.ds-foot-hint')).toHaveText('1 change · Ctrl+S saves');
  await expect(save).toBeEnabled();
});
