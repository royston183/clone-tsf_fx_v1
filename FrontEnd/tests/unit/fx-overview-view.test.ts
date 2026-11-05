import { afterEach, expect, it, vi } from 'vitest';
import { setPlatform } from '@core/platform';
import { resetConfig } from '@core/server/config';
import { resetModuleBackends } from '@core/server/module-service';
import { loadSapConfig } from '@core/sap/config';
import { browserPlatform } from '@/lib/client/browser-platform';
import { moduleView } from '@/lib/client/data';
import { stubSessionStorage } from '../support/storage';

afterEach(() => { vi.unstubAllGlobals(); resetModuleBackends(); resetConfig(); });

it('opens the actual FX Overview with its configured SAP service and no invented entity', async () => {
  stubSessionStorage();
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  setPlatform(browserPlatform(loadSapConfig({}), 'fullstack'));
  resetConfig();
  resetModuleBackends();
  const view = await moduleView('fx-overview');
  expect(view.mode).toBe('odata');
  expect(view.service).toBe('ZFS_SB_TSFDEAL_O4_API');
  // Its lookups belong to the dashboard definition; it has no entity of its own to fetch.
  expect(fetch).not.toHaveBeenCalled();
});
