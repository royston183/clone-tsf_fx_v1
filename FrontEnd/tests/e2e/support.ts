import { existsSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { DEMO_PASSWORD, DEMO_USER } from '../support/demo';
import { createRelayStub, RELAY_ORIGIN, SAP_ACCOUNT, type RelayStub } from './relay-stub';

/** An FE + BE + DB application: its API calls cross the network, where a test can watch or fake them. */
export const HAS_BACKEND = existsSync('../BackEnd/package.json');
/** Why a test that watches or fakes API requests does not run in a Front end only application (its API runs in the page). */
export const NETWORK_ONLY = 'watches or fakes API requests on the network; a Front end only application answers them in the page';

/**
 * Calls the application's data client the way its screens do (window.__appData, src/main.tsx): `layoutsRemove`,
 * `objectWrite`, ... Rejects with the error's message.
 */
export function appData<T = unknown>(page: Page, fn: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(([f, a]) => (window as unknown as Record<string, Record<string, (...x: unknown[]) => Promise<unknown>>>).__appData[f as string](...(a as unknown[])), [fn, args] as const) as Promise<T>;
}

const stubbed = new WeakMap<Page, RelayStub>();

/**
 * The SAP relay of this page: answered from the Time Buckets sample data by page.route on 127.0.0.1:3399 (the build's
 * VITE_SAP_RELAY_URL, playwright.config.ts). Anything addressed to port 3001, where the real relay of this PC runs, is
 * aborted: no test can reach it, or the SAP system behind it.
 */
export async function stubRelay(page: Page): Promise<RelayStub> {
  const have = stubbed.get(page);
  if (have) return have;
  const stub = createRelayStub();
  stubbed.set(page, stub);
  await page.context().route(/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]):3001(\/|$)/, route => route.abort('blockedbyclient'));
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
  // Signing in opens the real FX Overview. Its background master-contract read must
  // be a fixture too, rather than making every unrelated UI test call live middleware.
  await page.route('**/api/modules/master-contract/contracts/query', route => route.fulfill({
    status: 200, headers: { ...cors, 'content-type': 'application/json' },
    body: JSON.stringify({ rows: [], total: 0, page: 1, pageSize: 100 })
  }));
  await page.route(`${RELAY_ORIGIN}/**`, async route => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const answer = stub.handle({ method: request.method(), url: request.url(), headers: request.headers(), body: request.postData() ?? '' });
    return route.fulfill({ status: answer.status, headers: { ...answer.headers, ...cors }, body: answer.body });
  });
  // The tab's SAP account (sessionStorage, as Settings -> SAP Connection saves it): the stub's user.
  await page.addInitScript(([key, account]) => {
    try { if (sessionStorage.getItem(key) === null) sessionStorage.setItem(key, JSON.stringify(account)); } catch { /* storage blocked */ }
  }, ['app-sap-account', SAP_ACCOUNT] as const);
  return stub;
}

/** Signs in with the application login (demo / demo and the captcha) on a page whose SAP relay is the stub. */
export async function signIn(page: Page, password = DEMO_PASSWORD) {
  await stubRelay(page);
  await page.goto('/login');
  await page.getByLabel('Username').fill(DEMO_USER);
  await page.getByPlaceholder('Enter your password').fill(password);
  const label = await page.getByRole('img', { name: /Captcha characters/ }).getAttribute('aria-label');
  await page.getByRole('textbox', { name: 'Captcha code' }).fill(label!.replace('Captcha characters: ', '').replace(/ /g, ''));
  await page.getByRole('button', { name: 'Sign in' }).click();
}
