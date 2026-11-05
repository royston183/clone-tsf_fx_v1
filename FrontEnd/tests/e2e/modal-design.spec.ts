import { expect, test, type Page } from '@playwright/test';
import { appData } from './support';

const runtimeErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = []; runtimeErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
  await page.context().route(/^https?:\/\/(localhost|127\.0\.0\.1):3001(\/|$)/, route => route.abort('blockedbyclient'));
  await page.addInitScript(() => sessionStorage.setItem('app-signed-in', JSON.stringify({ username: 'demo' })));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1, name: 'Overview', exact: true })).toBeVisible();
});
test.afterEach(async ({ page }) => { expect(runtimeErrors.get(page)).toEqual([]); });

test('amount shortcuts expand on Enter and blur, retain cents and stay right aligned with commas', async ({ page }) => {
  await page.goto('/gallery');
  await page.getByRole('button', { name: 'Open 2 columns' }).click();
  const modal = page.getByRole('dialog', { name: 'Create Deal', exact: true });
  const amount = modal.getByRole('textbox', { name: 'Amount', exact: true });
  await expect(modal.getByRole('combobox', { name: 'Amount unit', exact: true })).toHaveCount(0);
  for (const [text, expected] of [
    ['1L', '1,00,000.00'], ['2Cr', '2,00,00,000.00'], ['500K', '5,00,000.00'], ['1M', '10,00,000.00'], ['1B', '1,00,00,00,000.00'],
    ['1.25 lakhs', '1,25,000.00'], ['2 million', '20,00,000.00'], ['3 thousands', '3,000.00'], ['0.00000000001B', '0.01']
  ]) {
    await amount.fill(text); await amount.press('Enter');
    await expect(amount).toHaveValue(expected);
    await expect(modal).toBeVisible();
  }
  await amount.fill('1.5 million'); await amount.blur();
  await expect(amount).toHaveValue('15,00,000.00');
  expect(await amount.evaluate(e => getComputedStyle(e).textAlign)).toBe('right');
  await amount.fill('1L'); await amount.press('Enter');
  await modal.getByLabel('Deal', { exact: true }).fill('TL-1001');
  await modal.getByLabel('Product Type', { exact: true }).selectOption('01');
  await modal.getByLabel('Currency', { exact: true }).fill('INR');
  await modal.getByLabel('Validity from', { exact: true }).fill('2026-04-01');
  await modal.getByLabel('Validity to', { exact: true }).fill('2031-03-31');
  await modal.screenshot({ path: test.info().outputPath('amount-shortcut-form.png') });
  await amount.fill('1QQ'); await amount.press('Enter');
  await modal.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(amount).toHaveAttribute('aria-invalid', 'true');
  await expect(amount).toHaveValue('1QQ');
});

test('record shortcuts save the full base amount; focus/blur alone does not mark the record dirty', async ({ page }) => {
  const created = await appData<{ header: { deal: string } }>(page, 'objectWrite', 'sample-deals', 'create', {
    header: { name: 'Amount unit regression', product: '51A', counterparty: 'CP003', amount: '2500000.01', currency: 'INR', start: '2026-04-01', end: '2031-03-31' }, items: { flows: [] }
  });
  try {
    await page.goto(`/samples/deals?open=${created.header.deal}`);
    const modal = page.getByRole('dialog', { name: new RegExp(`^(?:Edit )?Deal ${created.header.deal}$`) });
    await modal.getByRole('button', { name: 'Edit', exact: true }).click();
    const amount = modal.getByRole('textbox', { name: 'Amount', exact: true });
    await amount.focus(); await amount.blur();
    await expect(modal.locator('.ds-foot-hint')).toContainText('No changes yet');
    await expect(amount).toHaveValue('25,00,000.01');
    await amount.fill('30L'); await amount.press('Enter');
    await expect(amount).toHaveValue('30,00,000.00');
    await modal.getByRole('button', { name: 'Save', exact: true }).click();
    const review = page.getByRole('dialog', { name: `Save Deal ${created.header.deal}`, exact: true });
    await review.getByRole('combobox', { name: 'Review amounts unit', exact: true }).selectOption('LAKHS');
    await expect(review.locator('tbody tr').filter({ hasText: 'Amount' })).toContainText('30.00');
    await review.getByRole('button', { name: 'Yes, Save Changes' }).click();
    await expect(review).toBeHidden();
    const saved = await appData<{ header: { amount: string } }>(page, 'objectRead', 'sample-deals', { deal: created.header.deal });
    expect(saved.header.amount).toBe('3000000.00');
  } finally {
    const latest = await appData<{ header: { __etag: string } }>(page, 'objectRead', 'sample-deals', { deal: created.header.deal });
    await appData(page, 'objectWrite', 'sample-deals', 'delete', { key: { deal: created.header.deal }, etag: latest.header.__etag });
  }
});

test('upload conversion retains full precision and posts the valid entries', async ({ page }) => {
  await page.goto('/samples/budget-upload');
  await page.getByRole('button', { name: 'Upload File' }).click();
  const modal = page.getByRole('dialog', { name: 'Upload Budget Lines' });
  await modal.locator('input[type=file]').setInputFiles({ name: 'units.csv', mimeType: 'text/csv', buffer: Buffer.from('GL Account,Cost Center,Period,Period Year,Amount,Currency\n400100,CC30,April,2026,125000.01,INR') });
  await modal.getByRole('combobox', { name: 'Upload amounts unit', exact: true }).selectOption('LAKHS');
  await expect(modal.locator('tbody tr')).toContainText('1.2500001');
  await modal.getByRole('button', { name: 'Post 1 Rows' }).click();
  await expect(modal).toBeHidden();
  await expect(page.locator('.ds-toast')).toHaveText('1 created, 0 updated');
});

test('form widths follow their data and stay inside the modal in both themes and on phones', async ({ page }) => {
  await page.goto('/gallery');
  const open = page.getByRole('button', { name: 'Open 2 columns' });
  await open.click();
  const modal = page.getByRole('dialog', { name: 'Create Deal', exact: true });
  for (const theme of ['light', 'dark']) {
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      const box = (await modal.boundingBox())!;
      expect(box.width).toBeLessThanOrEqual(800);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      for (const input of await modal.locator('input[type=date]').all()) expect((await input.boundingBox())!.width).toBeLessThanOrEqual(170);
      const overflow = await modal.locator('.ds-modal-body').evaluate(e => e.scrollWidth - e.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      await expect(modal.getByRole('button', { name: 'Save', exact: true })).toBeInViewport();
      await modal.screenshot({ path: test.info().outputPath(`form-${theme}-${width}.png`) });
    }
  }
  await page.keyboard.press('Escape');
  await expect(open).toBeFocused();
});

test('shared tables keep headings, data and sorting aligned with compact schema-based widths', async ({ page }) => {
  await page.goto('/samples/deals');
  const table = page.locator('.kit-list table.kit-data-table');
  await expect(table.locator('tbody tr')).toHaveCount(50);
  await expect(table.locator('colgroup col')).toHaveCount(await table.locator('thead tr').first().locator('th').count());
  for (const theme of ['light', 'dark']) {
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const columns = await table.evaluate(t => {
        const head = [...t.querySelectorAll('thead tr:first-child th')];
        const cells = [...t.querySelectorAll('tbody tr:first-child td')];
        return head.map((h, i) => ({
          label: h.textContent?.trim(), side: getComputedStyle(h).textAlign, cellSide: getComputedStyle(cells[i]).textAlign,
          x: h.getBoundingClientRect().x, cellX: cells[i].getBoundingClientRect().x,
          width: h.getBoundingClientRect().width, cellWidth: cells[i].getBoundingClientRect().width,
          padding: getComputedStyle(h).paddingRight, cellPadding: getComputedStyle(cells[i]).paddingRight
        }));
      });
      for (const column of columns) {
        expect(column.side).toBe(column.cellSide);
        expect(Math.abs(column.x - column.cellX)).toBeLessThan(1);
        expect(Math.abs(column.width - column.cellWidth)).toBeLessThan(1);
        expect(column.padding).toBe(column.cellPadding);
      }
      expect(columns.find(c => c.label === 'Amount')?.side).toBe('right');
      expect(columns.find(c => c.label === 'Currency')!.width).toBeLessThan(150);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: test.info().outputPath(`table-${theme}-${width}.png`), fullPage: true });
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await table.getByRole('button', { name: 'Amount', exact: true }).click();
  await expect(table.locator('th').filter({ hasText: 'Amount' })).toHaveAttribute('aria-sort', 'ascending');
});

test('amount range filters use the same shorthand and right-aligned comma grouping', async ({ page }) => {
  await page.goto('/samples/deals');
  const from = page.getByRole('textbox', { name: 'Amount from', exact: true });
  const to = page.getByRole('textbox', { name: 'Amount to', exact: true });
  await from.fill('1L'); await from.press('Enter');
  await to.fill('1M'); await to.press('Enter');
  await expect(from).toHaveValue('1,00,000.00');
  await expect(to).toHaveValue('10,00,000.00');
  expect(await from.evaluate(e => getComputedStyle(e).textAlign)).toBe('right');
  await expect.poll(async () => {
    const values = await page.locator('.kit-list tbody tr td:nth-child(5)').allTextContents();
    return values.length > 0 && values.every(v => Number(v.replace(/,/g, '')) >= 100000 && Number(v.replace(/,/g, '')) <= 1000000);
  }).toBe(true);
});

test('read-only conversions work by keyboard and grid inputs expand shorthand amounts', async ({ page }) => {
  await page.goto('/gallery');
  await page.getByRole('button', { name: 'Open deal', exact: true }).click();
  const record = page.getByRole('dialog', { name: 'Deal TL-1001', exact: true });
  const open = record.getByRole('button', { name: 'Convert Amount', exact: true });
  await open.focus(); await open.press('Enter');
  const converter = page.getByRole('dialog', { name: 'Amount conversion', exact: true });
  const picker = converter.getByRole('combobox', { name: 'Amount unit', exact: true });
  await expect(picker).toBeFocused();
  await picker.selectOption('LAKHS');
  await expect(record.locator('.kit-amount-value')).toContainText('25.00 Lakhs');
  await page.setViewportSize({ width: 320, height: 844 });
  await expect(converter).toBeHidden();
  await open.click();
  const bounds = (await converter.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  await page.keyboard.press('Escape');
  await expect(record).toBeVisible();
  await expect(open).toBeFocused();
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 900 });
  const cell = page.locator('[data-gallery-id="F-amount"] .kit-amount-cell').filter({ has: page.locator('input:not([disabled]):not([readonly])') }).first();
  await cell.locator('input').fill('2Cr'); await cell.locator('input').press('Enter');
  await expect(cell.locator('input')).toHaveValue('2,00,00,000.00');
  await cell.locator('input').fill('1.25M'); await cell.locator('input').blur();
  await expect(cell.locator('input')).toHaveValue('12,50,000.00');
});
