import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { applications } from '../../src/config/catalog';
import { readXlsx } from '../../src/lib/client/xlsx';
import { signIn } from './support';

test('table layouts hide, reorder and persist columns; Excel follows the visible layout', async ({ page }) => {
  await signIn(page);
  await page.goto('/settings/service-mappings');
  const table = page.locator('table.kit-data-table');
  await table.locator('thead').getByRole('button', { name: 'Application', exact: true }).click();
  await page.getByRole('button', { name: 'Change Layout', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Change Layout', exact: true });
  await dialog.getByRole('option', { name: 'Service binding', exact: true }).dblclick();
  await dialog.getByRole('option', { name: 'Service path', exact: true }).click();
  await dialog.getByRole('button', { name: 'Move the selected column up', exact: true }).click();
  await dialog.getByRole('button', { name: 'Save Layout…', exact: true }).click();
  const save = page.getByRole('dialog', { name: 'Save Layout', exact: true });
  await save.getByLabel('Layout name', { exact: true }).fill('Compact services');
  await save.getByLabel('Default layout (opens with the screen)', { exact: true }).check();
  await save.getByRole('button', { name: 'Save Layout', exact: true }).click();
  await expect(table.locator('thead th')).toHaveCount(3);
  await expect(table.locator('thead th').first()).toContainText('Service path');
  await page.reload();
  await expect(table.locator('thead th').first()).toContainText('Service path');
  await expect(table.locator('thead th')).toHaveCount(3);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export table to Excel', exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.xlsx$/);
  const bytes = await readFile((await file.path())!);
  const workbook = await readXlsx(Uint8Array.from(bytes).buffer);
  expect(workbook[0].cells).toEqual(['Service path', 'Application', 'Status']);
  expect(workbook.length).toBeGreaterThan(10);
  await page.getByLabel('Layout', { exact: true }).selectOption('');
  await expect(table.locator('thead th')).toHaveCount(4);
});

test('imported tables sort formerly static amounts and fit long values on a single line', async ({ page }) => {
  const masters = [12000, 19, 800].map((amount, index) => ({ ZMC_REF_NO: `200000000${index + 1}`, ZMC_STAT: '02', ZORIGIN: 'OSIPL', ZMC_DATE: '2026-04-01', ZAMT: String(amount), ZORG_AMT: String(amount), ZOCURR: 'USD', ZEX_RATE: '1', ZMC_DESC: 'A long reference description that must remain on one line without clipping', ZSHIP_START: '2026-04-01', ZSHIP_END: '2026-12-31' }));
  await page.route('**/api/ref/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rows: new URL(route.request().url()).pathname.endsWith('/data/masterContract') ? masters : [], value: [], total: 0 }) }));
  await signIn(page);
  await page.goto(applications.find(app => app.id === 'mo-confirm-master-contract')!.href);
  const table = page.locator('#mc-table');
  await expect(table.locator('tbody tr')).toHaveCount(3);
  await table.getByRole('button', { name: 'MC Amt (Origin)', exact: true }).click();
  const amounts = () => table.locator('tbody tr').evaluateAll(rows => rows.map(row => Number((row as HTMLTableRowElement).cells[14].textContent!.replaceAll(',', '').trim())));
  await expect.poll(amounts).toEqual([19, 800, 12000]);
  await table.getByRole('button', { name: 'MC Amt (Origin)', exact: true }).click();
  await expect.poll(amounts).toEqual([12000, 800, 19]);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const wrapped = await table.locator('tbody td').evaluateAll(cells => cells.filter(cell => getComputedStyle(cell).whiteSpace !== 'nowrap').length);
    expect(wrapped).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: 'Change Layout', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export table to Excel', exact: true })).toBeVisible();
  }
});

test('every displayed server-list column sorts across pages, with Excel available in dialogs too', async ({ page }) => {
  await signIn(page);
  await page.goto('/samples/deals');
  const table = page.locator('.kit-list table');
  for (const column of ['Product Type', 'Counterparty', 'Currency', 'Status']) {
    await table.getByRole('button', { name: column, exact: true }).click();
    await expect(table.locator('th').filter({ has: page.getByRole('button', { name: column, exact: true }) })).toHaveAttribute('aria-sort', 'ascending');
    await expect(page.locator('.kit-list [aria-busy]')).toHaveAttribute('aria-busy', 'false');
  }
  const firstKey = (await table.locator('tbody tr').first().locator('td').first().innerText()).trim();
  const listDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export table to Excel', exact: true }).click();
  const listFile = await listDownload;
  const listWorkbook = await readXlsx(Uint8Array.from(await readFile((await listFile.path())!)).buffer);
  expect(listWorkbook[1].cells[0]).toBe(firstKey);
  expect(listWorkbook[1].cells[0]).toMatch(/^0\d+$/);
  await table.locator('tbody tr').first().click();
  const dialog = page.getByRole('dialog').first();
  await dialog.getByRole('tab', { name: 'Cash Flows', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Export table to Excel', exact: true })).toBeVisible();
  const dialogDownload = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export table to Excel', exact: true }).click();
  const dialogFile = await dialogDownload;
  const dialogWorkbook = await readXlsx(Uint8Array.from(await readFile((await dialogFile.path())!)).buffer);
  expect(dialogWorkbook[0].cells).toContain('Amount');
});
