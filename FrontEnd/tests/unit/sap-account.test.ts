import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isRejected, newSapConnection } from '@core/sap/client';
import { actingUser, currentAccount, resetAccount, sapConnection, testAndSave } from '@/lib/client/sap-account';
import { startMockSap, type MockSap } from '../support/mock-sap';
import { installTestPlatform } from '../support/platform';
import { stubSessionStorage } from '../support/storage';

const GOOD = 'secret', BAD = 'wrong';
let sap: MockSap;
let store: Map<string, string>;
installTestPlatform();
beforeEach(async () => {
  vi.unstubAllGlobals();
  store = stubSessionStorage();
  sap = await startMockSap();
  // The build default points the services at the relay; the mock SAP stands in for it.
  vi.stubEnv('VITE_SAP_RELAY_URL', new URL(sap.base).origin);
});
afterEach(async () => { vi.unstubAllEnvs(); await sap.close(); });

describe('SAP account', () => {
  it('is DEMO with no account, and the SAP user uppercased once saved', async () => {
    expect(actingUser()).toBe('DEMO');
    expect(sapConnection()).toBeNull();
    await testAndSave({ username: 'TESTER', password: GOOD, client: '100' });
    expect(actingUser()).toBe('TESTER');
    expect(sapConnection()).not.toBeNull();
    expect(sapConnection()).toBe(sapConnection());
    expect(currentAccount()).toEqual({ username: 'TESTER', password: GOOD, client: '100' });
  });
  it('saves only on success; a rejected account is not saved and stays paused until it is retried', async () => {
    await expect(testAndSave({ username: 'TESTER', password: BAD, client: '100' })).rejects.toThrow();
    expect(store.has('app-sap-account')).toBe(false);
    expect(isRejected(newSapConnection('TESTER', BAD))).toBe(true);
    const before = sap.log.length;
    await expect(testAndSave({ username: 'TESTER', password: BAD, client: '100' })).rejects.toThrow('SAP rejected the user name or password.');
    expect(sap.log.length).toBeGreaterThan(before);
  });
  it('an empty password keeps the saved one for the same user', async () => {
    await testAndSave({ username: 'TESTER', password: GOOD, client: '100' });
    await testAndSave({ username: 'TESTER', password: '', client: '100' });
    expect(currentAccount().password).toBe('secret');
    await expect(testAndSave({ username: 'OTHER', password: '', client: '100' })).rejects.toThrow();
  });
  it('resetAccount returns to the build default', async () => {
    await testAndSave({ username: 'TESTER', password: GOOD, client: '100' });
    resetAccount();
    expect(store.has('app-sap-account')).toBe(false);
    expect(actingUser()).toBe('DEMO');
  });
});
