import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setPlatform } from '@core/platform';
import { REJECTED_MESSAGE } from '@core/sap/client';
import { resetConfig } from '@core/server/config';
import { resetModuleBackends } from '@core/server/module-service';
import { signIn } from '@/lib/client/app-login';
import { browserPlatform } from '@/lib/client/browser-platform';
import { moduleView } from '@/lib/client/data';
import { buildConfig, buildConfigError } from '@/lib/client/sap-account';
import { checkSapService, saveSapAccount, workspaceInfo } from '@/lib/client/workspace';
import { startMockSap, type MockSap } from '../support/mock-sap';
import { stubSessionStorage } from '../support/storage';

const GOOD = 'secret', BAD = 'wrong';
let sap: MockSap;
beforeEach(async () => {
  vi.unstubAllGlobals();
  stubSessionStorage();
  sap = await startMockSap();
  // The mock SAP stands in for the relay.
  vi.stubEnv('VITE_SAP_RELAY_URL', new URL(sap.base).origin);
  setPlatform(browserPlatform(buildConfig(), 'fullstack'));
  resetConfig();
  resetModuleBackends();
});
afterEach(async () => { vi.unstubAllEnvs(); await sap.close(); });

describe('the workspace in the browser', () => {
  it('is signed out until the app login, then names the relay and its services', () => {
    expect(workspaceInfo().session).toBeNull();
    expect(signIn('demo', 'demo')).toBe(true);
    const ws = workspaceInfo();
    expect(ws.session).toMatchObject({ username: 'demo', sapUsername: '', actingUser: 'DEMO', sapStatus: 'none' });
    expect(ws.relayUrl).toBe(new URL(sap.base).origin);
    expect(ws.usesSap).toBe(true);
    expect(ws.services[0]).toMatchObject({ key: 'timebuckets', path: expect.stringContaining('/srvd_a2x/') as string, url: sap.base });
  });

  it('Test & save: a rejected account pauses SAP calls; testing again retries and connects', async () => {
    signIn('demo', 'demo');
    await saveSapAccount({ username: 'tester', password: GOOD, client: '100' });
    expect(workspaceInfo().session).toMatchObject({ sapUsername: 'TESTER', actingUser: 'TESTER', sapStatus: 'connected' });
    // The password is changed on SAP: the next call is rejected and further calls are paused.
    sap.failNext(401, 'Unauthorized');
    await expect(moduleView('timebuckets')).rejects.toThrow(REJECTED_MESSAGE);
    expect(workspaceInfo().session).toMatchObject({ sapStatus: 'unavailable', sapError: REJECTED_MESSAGE });
    const before = sap.log.length;
    await expect(moduleView('timebuckets')).rejects.toThrow(REJECTED_MESSAGE);
    expect(sap.log.length).toBe(before);
    // The explicit service test retries once.
    await expect(checkSapService('timebuckets')).resolves.toMatchObject({ connected: true });
    expect(workspaceInfo().session?.sapStatus).toBe('connected');
    await expect(moduleView('timebuckets')).resolves.toMatchObject({ mode: 'odata' });
  });

  it('a failed Test & save keeps the account that was saved', async () => {
    signIn('demo', 'demo');
    await expect(saveSapAccount({ username: 'tester', password: BAD, client: '100' })).rejects.toThrow();
    expect(workspaceInfo().session).toMatchObject({ sapUsername: '', sapStatus: 'none' });
  });

  it('a new SAP client gets its own SAP backend', async () => {
    signIn('demo', 'demo');
    await saveSapAccount({ username: 'tester', password: GOOD, client: '100' });
    await moduleView('timebuckets');
    expect(sap.log.at(-1)?.query.get('sap-client')).toBe('100');
    // The tab's account moves to client 200 (as Test & save stores it): the next read uses a new backend on 200.
    sessionStorage.setItem('app-sap-account', JSON.stringify({ username: 'TESTER', password: GOOD, client: '200' }));
    expect(workspaceInfo().client).toBe('200');
    await moduleView('timebuckets').catch(() => undefined);
    expect(sap.log.at(-1)?.query.get('sap-client')).toBe('200');
  });
});

describe('the build\'s SAP settings', () => {
  it('a wrong value is reported once, named as the build setting, and never thrown at start-up', () => {
    vi.stubEnv('VITE_SAP_CLIENT', '1000');
    expect(buildConfigError()).toBe('Invalid VITE_SAP_CLIENT: must have three digits. Fix it in .env.local and build again.');
    expect(() => buildConfig()).toThrow('Invalid VITE_SAP_CLIENT');
    vi.stubEnv('VITE_SAP_CLIENT', '100');
    expect(buildConfigError()).toBe('');
  });
});
