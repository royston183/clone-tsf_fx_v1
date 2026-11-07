import { expect, test, type Page } from '@playwright/test';
import { signIn } from './support';

const rows = (page: Page) => page.locator('section.ds-app table.ds-table tbody tr');

test('without a session every page goes to the sign-in page', async ({ page }) => {
  await page.goto('/samples/time-buckets');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

test('a wrong password is refused, then sign in and sign out', async ({ page }) => {
  await signIn(page, 'wrong');
  await expect(page.getByText('Incorrect user name or password.')).toBeVisible();
  await signIn(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
});

test.describe('signed in', () => {
test.beforeEach(async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
});

test('opens the workspace after sign-in', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
  // The account is checked once by itself after sign-in (the e2e relay answers like SAP).
  await expect(page.locator('.connection-chip')).toHaveText('SAP connected');
  await page.getByRole('link', { name: 'All applications ↗' }).click();
  await expect(page.getByRole('link', { name: /FX Blotter/ })).toBeVisible();
});

test('rail, navigation and breadcrumb', async ({ page }) => {
  await page.goto('/');
  const rail = page.locator('.sidebar');
  await page.mouse.move(900, 500);
  await expect.poll(async () => (await rail.boundingBox())?.width).toBe(64);
  await rail.hover();
  await expect.poll(async () => (await rail.boundingBox())?.width).toBe(288);
  await rail.getByRole('link', { name: 'Samples', exact: true }).click();
  await expect(page).toHaveURL(/\/samples$/);
  await page.mouse.move(900, 500);
  await page.getByRole('link', { name: /Time Buckets/ }).click();
  await expect(page).toHaveURL(/\/samples\/time-buckets$/);
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Time Buckets');
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/samples$/);
  await page.goto('/samples/nope');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});

test('day and night theme persists', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Night' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Day' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('workbench sorts, searches and filters', async ({ page }) => {
  await page.goto('/samples/time-buckets');
  await expect(rows(page)).toHaveCount(3);
  const sortDescription = page.getByRole('button', { name: 'Description', exact: true });
  const header = page.locator('th', { has: sortDescription });
  await sortDescription.click();
  await expect(header).toHaveAttribute('aria-sort', 'ascending');
  await expect(rows(page).first().locator('td').nth(2)).toHaveText('2 to 7 days');
  await sortDescription.click();
  await expect(header).toHaveAttribute('aria-sort', 'descending');
  await expect(rows(page).first().locator('td').nth(2)).toHaveText('Over 1 month and up to 2 months');
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('Day 1');
  await expect(rows(page)).toHaveCount(1);
  await expect(page.locator('.ds-title .pill').first()).toHaveText('1 record of 3');
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(rows(page)).toHaveCount(3);
  await page.getByRole('button', { name: 'Filter Bucket' }).click();
  const dialog = page.getByRole('dialog', { name: 'Column filter' });
  await dialog.getByLabel('Select All').uncheck();
  await dialog.getByLabel('B02', { exact: true }).check();
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first().locator('td').nth(1)).toHaveText('B02');
  await page.getByRole('tab', { name: /ALM 2\/3 Buckets/ }).click();
  await expect(rows(page)).toHaveCount(2);
});

test('adds, edits and deletes a bucket', async ({ page }) => {
  await page.goto('/samples/time-buckets');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const add = page.getByRole('dialog', { name: 'Add ALM 1 Buckets' });
  const cell = (label: string) => add.getByLabel(`${label}, row 1`, { exact: true });
  await cell('Bucket *').fill('B99');
  await cell('Description *').fill('Test bucket');
  await cell('XBRL Code *').fill('ALM1-B99');
  await cell('From No *').fill('3');
  await cell('From Freq *').selectOption({ label: 'Year(s)' });
  await cell('To No *').fill('5');
  await cell('To Freq *').selectOption({ label: 'Year(s)' });
  await cell('RBI No *').fill('9');
  await add.getByRole('button', { name: 'Add 1 Entry' }).click();
  await expect(page.locator('.ds-toast')).toHaveText('1 Entry added');
  const b99 = page.locator('section.ds-app table.ds-table tbody tr', { hasText: 'B99' });
  await expect(b99).toContainText('3 Year(s)');
  await expect(b99).toContainText('TESTER on');

  await b99.dblclick();
  const edit = page.getByRole('dialog', { name: 'Edit ALM 1 Bucket' });
  await edit.getByLabel('Description *, row 1', { exact: true }).fill('Renamed bucket');
  await edit.getByRole('button', { name: 'Update 1 Entry' }).click();
  await page.getByRole('button', { name: 'Yes, Update 1 Entry' }).click();
  await expect(page.locator('.ds-toast')).toHaveText('1 Entry updated');
  await expect(b99).toContainText('Renamed bucket');

  await page.getByRole('checkbox', { name: 'Select B99' }).check();
  await page.getByRole('button', { name: 'Delete (1)' }).click();
  await page.getByRole('button', { name: 'Yes, Delete 1 Entry' }).click();
  await expect(page.locator('.ds-toast')).toHaveText('1 Entry deleted');
  await expect(b99).toHaveCount(0);
});

test('Enter on Cancel cancels a delete', async ({ page }) => {
  await page.goto('/samples/time-buckets');
  await page.getByRole('checkbox', { name: 'Select B01' }).check();
  await page.getByRole('button', { name: 'Delete (1)' }).click();
  const cancel = page.getByRole('dialog', { name: 'Delete ALM 1 Bucket' }).getByRole('button', { name: 'Cancel' });
  await cancel.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Delete ALM 1 Bucket' })).toHaveCount(0);
  await expect(rows(page)).toHaveCount(3);
  await expect(page.locator('.ds-toast')).toHaveCount(0);
});

test('settings pages', async ({ page }) => {
  await page.goto('/settings/appearance');
  await page.getByRole('button', { name: 'Dark workspace' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Light workspace' }).click();
  await page.goto('/settings/sap-connection');
  await expect(page.getByText('through the SAP relay at http://127.0.0.1:3399, with the SAP account below')).toBeVisible();
  await expect(page.getByText('SAP user TESTER')).toBeVisible();
  await page.goto('/settings/service-mappings');
  await expect(page.getByRole('cell', { name: 'View List of TSF Deals', exact: true })).toBeVisible();
});

test('the page asks its own origin for nothing but its static files', async ({ page, baseURL }) => {
  const own: string[] = [];
  page.on('request', r => {
    const url = new URL(r.url());
    if (url.origin !== new URL(baseURL!).origin) return;
    // Static files: GET of the page, its /assets/, its public files (/logo.png) and the client routes (navigations); never /api.
    if (r.method() === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/assets/') || /^\/[\w-]+\.(png|svg|ico|webmanifest)$/.test(url.pathname) || r.isNavigationRequest())) return;
    own.push(`${r.method()} ${url.pathname}`);
  });
  for (const [path, heading] of [['/', 'Overview'], ['/samples/time-buckets', 'Time Buckets'], ['/samples/deals', 'Deals'], ['/settings/sap-connection', 'SAP Connection']]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 }).first()).toContainText(heading);
  }
  expect(own).toEqual([]);
});

test('mobile menu opens and closes on navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.sidebar')).toBeHidden();
  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await expect(page.locator('.sidebar.mobile-open')).toBeVisible();
  await page.locator('.sidebar').getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.locator('.sidebar.mobile-open')).toHaveCount(0);
});
});
