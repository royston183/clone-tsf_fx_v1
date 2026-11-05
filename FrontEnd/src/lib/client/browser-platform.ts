// The core's platform in the browser (both application types): SAP modules through the relay, modules on sample data
// in memory, and the application's own data in browser storage (Front end only; FE + BE + DB keeps it in the BackEnd,
// which data.ts calls instead).
import type { Actor } from '@core/actor';
import type { Row } from '@/lib/grid/types';
import type { ListPage } from '@/lib/list/types';
import type { Platform, StoredLayout, StoreState } from '@core/platform';
import { getConfig, type AppConfig } from '@core/server/config';
import { memoryLayoutStore, memoryStateStore, moduleLocalBackend, type StateStore } from '@core/server/local-store';
import { odataBackend } from '@core/server/odata-backend';
import { keptByBackend, sourceOf } from '@/modules/server-registry';
import { contractOf } from '@/modules/tables';
import { sapServiceOf, type SapConfig } from '@core/sap/config';
import { actingUser, currentAccount, sapConnection } from './sap-account';
import { backendApi } from './backend-api';

export type AppType = 'fullstack' | 'frontend';
const PREFIX = 'app-db:';

/** A value in localStorage under `app-db:<key>` (JSON); a full or blocked storage keeps it in memory only. */
function stored<T>(key: string): { load(): Promise<T | null>; save(value: T): Promise<void> } {
  return {
    load: async () => {
      let raw: string | null;
      try { raw = localStorage.getItem(PREFIX + key); } catch { return null; }
      return raw ? (JSON.parse(raw) as T) : null;
    },
    save: async value => {
      try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
    }
  };
}

/** The core's settings in the browser: the build (NODE_ENV). SAP settings are the build's VITE_SAP_* and the tab's account. */
const envOf = (): Record<string, string | undefined> => ({ NODE_ENV: import.meta.env.PROD ? 'production' : 'development' });

export function browserPlatform(sap: SapConfig, appType: AppType): Platform {
  return {
    env: envOf,
    // The relay keeps SAP's session cookies; the browser sends none to it.
    sapFetchInit: { credentials: 'omit' },
    keeps: entry => !(appType === 'fullstack' && keptByBackend(sourceOf(entry))),
    backend(id, entry) {
      const source = sourceOf(entry);
      if (source === 'sap') return odataBackend({ service: sapServiceOf(sap, entry.def.serviceKey), settings: { client: currentAccount().client, timeoutMs: sap.timeoutMs } }, entry.def, contractOf(entry));
      // A REST data service is reached by the BackEnd only (the FrontEnd is static and calls no other host but the relay).
      if (source === 'rest') throw new Error(`${id} keeps its data in a REST data service the BackEnd calls: call it through the data client (FE + BE + DB only).`);
      if (source === 'app') {
        if (appType === 'fullstack') throw new Error(`${id} keeps its data in the BackEnd: call it through the data client.`);
        return moduleLocalBackend(id, entry, stored<StoreState>(`data:${id}`) satisfies StateStore);
      }
      return moduleLocalBackend(id, entry, memoryStateStore());
    },
    // A `sap` module's backend is kept per service root and the tab's SAP client (a new client gets a new backend).
    scope: entry => (sourceOf(entry) === 'sap' ? `${sap.services[entry.def.serviceKey]?.base ?? ''}|${currentAccount().client}` : ''),
    // Dashboards in this page read the BackEnd's modules through its API (FE + BE + DB only).
    ...(appType === 'fullstack' ? {
      remote: {
        view: (id: string) => backendApi<{ tables?: Record<string, Row[]> }>(`/modules/${encodeURIComponent(id)}`),
        query: (id: string, table: string, q: unknown) => backendApi<ListPage>(`/modules/${encodeURIComponent(id)}/${encodeURIComponent(table)}/query`, { method: 'POST', body: q }),
        report: async (id: string, selection: Row) => (await backendApi<{ rows: Row[] }>(`/modules/${encodeURIComponent(id)}/report`, { method: 'POST', body: { selection } })).rows
      }
    } : {}),
    layouts(id, entry) {
      if (!sourceOf(entry)) return memoryLayoutStore();
      if (appType === 'fullstack') throw new Error(`The layouts of ${id} are kept in the BackEnd: call it through the data client.`);
      const store = stored<StoredLayout[]>(`layouts:${id}`);
      return { load: async () => (await store.load()) ?? [], save: store.save };
    }
  };
}

/** The core's configuration in the browser: what it uses there is NODE_ENV of the build (the UI Gallery). */
export const browserConfig = (): AppConfig => getConfig();

/** Who acts in this tab: the SAP user (else DEMO), with this account's SAP connection. */
export function browserActor(): Actor {
  const user = actingUser();
  return { id: `tab|${user}`, username: user, sap: sapConnection() };
}
