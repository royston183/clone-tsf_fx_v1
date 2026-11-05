import { afterAll, beforeAll } from 'vitest';
import type { Actor } from '@core/actor';
import { setPlatform } from '@core/platform';
import type { SapConnection, SapSettings } from '@core/sap/client';
import { loadConfig, type AppConfig } from '@core/server/config';
import { memoryLayoutStore, memoryStateStore, moduleLocalBackend } from '@core/server/local-store';
import { resetModuleBackends } from '@core/server/module-service';
import { odataBackend } from '@core/server/odata-backend';
import { SERVER_MODULES, sourceOf, type ModuleData } from '@/modules/server-registry';
import { contractOf } from '@/modules/tables';

// The platform of the core's tests in Node: `sap` modules go to a mock SAP acting as the relay (setMockRelay), every
// other module keeps its sample data in memory, layouts in memory. Like the browser, it sends no cookies: the relay
// keeps SAP's session.

const SETTINGS: SapSettings = { client: '100', timeoutMs: 3000 };
let relay: { base: string; settings: SapSettings } | null = null;

export function installTestPlatform(): void {
  setPlatform({
    env: () => ({}),
    backend(id, entry) {
      if (sourceOf(entry) === 'sap') {
        if (!relay) throw new Error(`${id} reads SAP: call setMockRelay(sap) first.`);
        // Every service of the test modules is the mock SAP's one service root.
        return odataBackend({ service: { key: entry.def.serviceKey, base: relay.base }, settings: relay.settings }, entry.def, contractOf(entry));
      }
      return moduleLocalBackend(id, entry, memoryStateStore());
    },
    scope: entry => (sourceOf(entry) === 'sap' ? `${relay?.base ?? ''}|${relay?.settings.client ?? ''}` : ''),
    layouts: () => memoryLayoutStore()
  });
  resetModuleBackends();
}

/** Sends the `sap` modules' calls to this mock SAP (its service root), with these SAP settings. */
export function setMockRelay(sap: { base: string }, settings: Partial<SapSettings> = {}): void {
  relay = { base: sap.base, settings: { ...SETTINGS, ...settings } };
}

/** A fresh platform (every module back on its sample data) and the core's configuration of a development page. */
export function freshConfig(): AppConfig {
  installTestPlatform();
  return loadConfig({});
}

/** The configuration with the `sap` modules on this mock SAP (as the relay). */
export function relayConfig(sap: { base: string }, settings: Partial<SapSettings> = {}): AppConfig {
  setMockRelay(sap, settings);
  return loadConfig({});
}

/** The acting user: demo without an SAP account, or the mock SAP's user with this connection. */
export const actingAs = (sap: SapConnection | null = null): Actor => (sap ? { id: 'tester', username: 'TESTER', sap } : { id: 'demo', username: 'demo', sap: null });

/**
 * For the tests of one describe block: these registered modules run on their sample data in memory (no source), then
 * get back the source they had. The core's other tests register them on SAP.
 */
export function onSampleData(...ids: string[]): void {
  const saved = new Map<string, ModuleData>();
  beforeAll(() => { for (const id of ids) { saved.set(id, SERVER_MODULES[id]); SERVER_MODULES[id] = { ...SERVER_MODULES[id], source: undefined }; } });
  afterAll(() => { for (const [id, entry] of saved) SERVER_MODULES[id] = entry; });
}
