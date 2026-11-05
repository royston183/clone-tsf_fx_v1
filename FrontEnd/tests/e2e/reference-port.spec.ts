import { expect, test } from '@playwright/test';
import { applications } from '../../src/config/catalog';
import manifest from '../../src/ref/port-manifest.json' with { type: 'json' };
import { signIn } from './support';

// These are rendering/navigation checks against empty upstream results. No reference
// request can reach the live middleware, and support.ts blocks the real SAP relay.
const batches = Array.from({ length: Math.ceil(manifest.ports.length / 7) }, (_, i) => manifest.ports.slice(i * 7, i * 7 + 7));

for (const [index, ports] of batches.entries()) {
  test(`reference FX screens mount and retain the shell (${index + 1}/${batches.length})`, async ({ page }) => {
    test.setTimeout(180000);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/ref/**', route => route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' },
      body: JSON.stringify({ ok: true, rows: [], value: [], total: 0, columns: [], resource: { columns: [] } })
    }));
    await signIn(page);
    for (const port of ports) {
      await test.step(port.id, async () => {
        const entry = applications.find(app => app.id === port.id);
        expect(entry, `Catalogue entry ${port.id}`).toBeTruthy();
        await page.goto(entry!.href);
        await expect(page.locator('.slc-ref')).toBeVisible();
        await expect(page.locator('.slc-ref').locator('.logo,.logo-img,.logo-mark,.fs-logo,.brand-mark,.brand-logo,.header-logo,.topbar-logo,.head-icon,.head-badge')).toHaveCount(0);
        await expect(page.locator('.slc-ref').getByRole('button', { name: /^Back/ }).first()).toBeVisible();
        await page.waitForLoadState('networkidle');
        for (const table of await page.locator('.slc-ref table').all()) {
          await expect(table).toHaveClass(/kit-data-table/);
          const heads = table.locator('thead tr').first().locator('th');
          if (!await heads.count()) continue;
          const tools = table.locator('xpath=preceding-sibling::*[1]');
          if (port.id !== 'view-all-transactions') await expect(tools.getByRole('button', { name: 'Export table to Excel', exact: true, includeHidden: true })).toBeAttached();
          await expect(tools.getByRole('button', { name: 'Change Layout', exact: true, includeHidden: true })).toBeAttached();
          if (await table.isVisible()) {
            if (port.id !== 'view-all-transactions') await expect(tools.getByRole('button', { name: 'Export table to Excel', exact: true })).toBeVisible();
            await expect(tools.getByRole('button', { name: 'Change Layout', exact: true })).toBeVisible();
          }
          for (const head of await heads.all()) {
            const text = (await head.innerText()).trim();
            if (!text || /^(actions?|select|remove|delete)$/i.test(text) || await head.locator('input').count()) continue;
            await expect(head.locator('button').first(), `${port.id}: sorting ${text}`).toBeAttached();
          }
        }
        const brokenImages = await page.locator('.slc-ref img').evaluateAll(images => images.filter(image => !(image as HTMLImageElement).naturalWidth).map(image => (image as HTMLImageElement).src));
        expect(brokenImages, `${port.id} images`).toEqual([]);
        await expect(page.locator('.sidebar')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
        expect(errors, port.id).toEqual([]);
      });
    }
  });
}

test('reference limit dialog works in dark mode on a narrow screen', async ({ page }) => {
  await page.route('**/api/ref/**', route => route.fulfill({
    status: 200,
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
    body: JSON.stringify({ rows: [], value: [], total: 0 })
  }));
  await signIn(page);
  await page.getByRole('button', { name: 'Night', exact: true }).click();
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto(applications.find(app => app.id === 'limit-management')!.href);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.slc-ref h1')).toHaveText('Limit Management Dashboard');
  const header = await page.locator('.limitmgmt .page-header').boundingBox();
  const list = await page.locator('.limitmgmt .table-col').boundingBox();
  expect(header).toBeTruthy();
  expect(list!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
  expect(header!.height).toBeLessThan(250);
  await page.getByRole('button', { name: 'Set Initial Limit', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Set Initial Limit', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Close', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
});

test('phone reference headings wrap and NDF actions stay below their filters', async ({ page }) => {
  await page.route('**/api/ref/**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ rows: [], value: [], total: 0 })
  }));
  await signIn(page);
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.goto(applications.find(app => app.id === 'short-straddle-deal-id')!.href);
  const heading = page.locator('.ssdid .page-title');
  const headingText = await heading.evaluate(element => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return [...range.getClientRects()].map(rect => ({ left: rect.left, right: rect.right }));
  });
  expect(headingText.every(rect => rect.left >= 0 && rect.right <= 390)).toBe(true);
  await page.goto(applications.find(app => app.id === 'tsf-ndf-fixing')!.href);
  const filters = await page.locator('.toolbar-filters').boundingBox();
  const actions = await page.locator('.toolbar-right').boundingBox();
  expect(actions!.y).toBeGreaterThanOrEqual(filters!.y + filters!.height);
  const title = await page.locator('.card-title').boundingBox();
  const toolbar = await page.locator('.tsf-ndf-fixing .toolbar').boundingBox();
  expect(toolbar!.y).toBeGreaterThanOrEqual(title!.y + title!.height);
});

test('reference master-contract headings match their values and every phone filter remains reachable', async ({ page }) => {
  const master = { ZMC_REF_NO: '2000000001', ZMC_STAT: '02', ZORIGIN: 'OSIPL', ZMC_DATE: '2026-04-01', ZAMT: '1234.56', ZORG_AMT: '1234.56', ZOCURR: 'USD', ZEX_RATE: '1', ZSHIP_START: '2026-04-01', ZSHIP_END: '2026-12-31' };
  await page.route('**/api/ref/**', route => route.fulfill({
    status: 200,
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' },
    body: JSON.stringify({ rows: new URL(route.request().url()).pathname.endsWith('/data/masterContract') ? [master] : [], value: [], total: 0 })
  }));
  await signIn(page);
  await page.goto(applications.find(app => app.id === 'mo-confirm-master-contract')!.href);
  const table = page.locator('#mc-table');
  await expect(table.getByRole('button', { name: '2000000001', exact: true })).toBeVisible();
  const amountHead = table.locator('thead th').nth(13);
  const amountCell = table.locator('tbody tr').first().locator('td').nth(13);
  await expect(amountHead).toHaveCSS('text-align', 'right');
  await expect(amountCell).toHaveCSS('text-align', 'right');
  const textRight = (element: Element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, { acceptNode: node => node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP });
    const range = document.createRange();
    range.selectNodeContents(walker.nextNode()!);
    return range.getBoundingClientRect().right;
  };
  expect(Math.abs(await amountHead.evaluate(textRight) - await amountCell.evaluate(textRight))).toBeLessThanOrEqual(2);
  await page.setViewportSize({ width: 390, height: 1000 });
  const clipped = await page.locator('.master-toolbar').evaluate(toolbar => [...toolbar.querySelectorAll('input,select,button')].filter(element => {
    const box = element.getBoundingClientRect();
    return box.width > 0 && (box.left < 0 || box.right > document.documentElement.clientWidth + 1);
  }).map(element => element.getAttribute('aria-label') || element.textContent));
  expect(clipped).toEqual([]);
});
