import { expect, test } from '@playwright/test';
import { signIn } from './support';

test.beforeEach(async ({ page }) => { await signIn(page); });

test('portfolio overview loads at once; scopes, units, flow expansion and collateral measures work', async ({ page }) => {
  await page.goto('/samples/portfolio-overview?s.keyDate=2026-10-27&s.company=&u=CRORES');
  const kpis = page.getByRole('region', { name: 'Key figures' });
  await expect(kpis.locator('article')).toHaveCount(5);
  await expect(page.locator('.kit-ov-entity')).toHaveCount(2);
  const count = await kpis.locator('article').nth(1).locator('strong').innerText();
  const outstanding = await kpis.locator('article').first().locator('strong').innerText();
  await page.getByRole('group', { name: 'Amount unit', exact: true }).getByRole('button', { name: 'Millions' }).click();
  await expect(kpis.locator('article').nth(1).locator('strong')).toHaveText(count);
  await expect(kpis.locator('article').first().locator('strong')).not.toHaveText(outstanding);
  const flow = page.getByRole('region', { name: 'Deal lifecycle', exact: true });
  await expect(flow.locator('.kit-flow-item').first()).toBeVisible();
  await flow.getByRole('button', { name: 'Collapse all' }).click();
  await expect(flow.locator('.kit-flow-item')).toHaveCount(0);
  await flow.getByRole('button', { name: 'Expand all' }).click();
  await expect(flow.locator('.kit-flow-item').first()).toBeVisible();
  const collateral = page.getByRole('region', { name: 'Collateral by security type', exact: true });
  const market = await collateral.locator('.ov-ch-pie-v').textContent();
  await collateral.getByRole('button', { name: 'Eligible value' }).click();
  await expect(collateral.locator('.ov-ch-pie-v')).not.toHaveText(market!);
  await page.getByRole('group', { name: 'Company code', exact: true }).getByRole('button', { name: '2000', exact: true }).click();
  await expect(page.locator('.kit-ov-entity')).toHaveCount(1);
  await expect(page.locator('.kit-ov-entity')).toContainText('2000');
  await expect(page.getByRole('group', { name: 'Amount unit', exact: true }).getByRole('button', { name: 'Millions' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Change key date' }).click();
  const date = page.getByRole('dialog', { name: 'Change key date' });
  await date.getByLabel('Key date', { exact: true }).fill('2026-06-30');
  await date.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Key date', exact: true })).toContainText('30-06-2026');
  await expect(kpis.locator('article')).toHaveCount(5);
  await page.reload();
  await expect(page.getByRole('region', { name: 'Key date', exact: true })).toContainText('30-06-2026');
});

for (const theme of ['light', 'dark']) for (const width of [1440, 390, 320]) {
  test(`template spacing and record dialogs: ${theme}, ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(t => { localStorage.setItem('app-theme', t); document.documentElement.dataset.theme = t; }, theme);
    const withinPage = async () => {
      const sizes = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, body: document.body.scrollWidth }));
      expect(sizes.body, 'horizontal scrolling stays inside tables').toBeLessThanOrEqual(sizes.viewport + 1);
    };
    for (const route of ['/', '/gallery', '/samples/deals', '/samples/time-buckets', '/settings/sap-connection', '/settings/appearance']) {
      await page.goto(route);
      await expect(page.locator('.content')).toBeVisible();
      await withinPage();
    }
    await page.goto('/gallery');
    const loading = page.locator('[data-gallery-id="B-loading"] .empty');
    await expect(loading).toBeVisible();
    expect((await loading.boundingBox())!.height, 'loading placeholders have compact padding').toBeLessThan(140);
    await page.goto('/samples/deals?open=0000010001');
    const dialog = page.getByRole('dialog', { name: 'Deal 0000010001', exact: true });
    await expect(dialog).toBeVisible();
    await withinPage();
    await expect.poll(async () => {
      const heading = await dialog.locator('.ds-modal-head').boundingBox();
      return heading?.height || Infinity;
    }, { message: 'record header stays compact' }).toBeLessThan(100);
    const tabs = dialog.getByRole('tablist');
    await tabs.getByRole('tab', { name: 'Basic Data' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(tabs.getByRole('tab', { name: 'Cash Flows' })).toBeFocused();
    await expect(tabs.getByRole('tab', { name: 'Cash Flows' })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');
    await expect(tabs.getByRole('tab', { name: 'Basic Data' })).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath('record-display.png') });
    await dialog.getByRole('button', { name: 'Edit', exact: true }).click();
    const edit = page.getByRole('dialog', { name: 'Edit Deal 0000010001', exact: true });
    await expect(edit.getByLabel('Deal', { exact: true })).toHaveAttribute('readonly', '');
    const name = edit.getByLabel('Deal Name', { exact: true });
    await name.fill('');
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expect(edit.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await expect(edit.locator('.ds-foot-hint')).toContainText('field to fix');
    await name.fill('Aligned example');
    await expect(edit.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
    await withinPage();
    const dates = edit.locator('input[type=date]');
    for (const date of await dates.all()) expect((await date.boundingBox())!.width, 'full date remains readable').toBeGreaterThanOrEqual(120);
    if (width === 1440) {
      const key = (await edit.getByLabel('Deal', { exact: true }).boundingBox())!;
      const partner = (await edit.getByLabel('Counterparty', { exact: true }).boundingBox())!;
      const product = (await edit.getByLabel('Product Type', { exact: true }).boundingBox())!;
      expect(Math.abs(product.y - partner.y), 'form controls in a row line up').toBeLessThanOrEqual(1);
      expect(Math.abs(key.x - product.x), 'left column shares an edge').toBeLessThanOrEqual(1);
    }
    await page.screenshot({ path: testInfo.outputPath('record-edit.png') });
    await edit.getByRole('tab', { name: 'Cash Flows' }).click();
    const cell = edit.locator('.ds-grid th').filter({ hasText: 'Amount' });
    await expect(cell).toHaveCSS('text-align', 'right');
    await page.screenshot({ path: testInfo.outputPath('record-items.png') });
  });
}
