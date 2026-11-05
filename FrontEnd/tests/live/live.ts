// What the live check runs with: the SAP relay and the SAP account, as the browser would use them. Settings come from
// SAP_RELAY_URL / SAP_USERNAME / SAP_PASSWORD / SAP_CLIENT, else their VITE_SAP_* build values (.env.local). The check
// is skipped, with the reason, when the account is not set or the relay does not answer.
import type { Actor } from '@core/actor';
import { setPlatform } from '@core/platform';
import { newSapConnection } from '@core/sap/client';
import { loadSapConfig, sapServiceOf, viteEnv, type SapConfig } from '@core/sap/config';
import { memoryLayoutStore, memoryStateStore, moduleLocalBackend } from '@core/server/local-store';
import { odataBackend } from '@core/server/odata-backend';
import { sourceOf } from '@/modules/server-registry';
import { contractOf } from '@/modules/tables';

export interface Live { sap: SapConfig; actor: Actor; ready: boolean; reason: string }

const SAP_KEYS = ['SAP_RELAY_URL', 'SAP_USERNAME', 'SAP_PASSWORD', 'SAP_CLIENT', 'SAP_TIMEOUT_MS', 'SAP_SYSTEM_ID'];

/** Does anything answer at the relay? A plain GET of its root, with no SAP account. */
async function relayAnswers(url: string): Promise<boolean> {
  try {
    await fetch(url, { signal: AbortSignal.timeout(3000), redirect: 'manual' });
    return true;
  } catch {
    return false;
  }
}

export async function liveSap(): Promise<Live> {
  const own = Object.fromEntries(SAP_KEYS.filter(k => process.env[k] !== undefined).map(k => [k, process.env[k]]));
  const sap = loadSapConfig({ ...viteEnv(process.env), ...own });
  const user = sap.account.username.trim().toUpperCase();
  const actor: Actor = { id: 'live', username: user || 'DEMO', sap: user && sap.account.password ? newSapConnection(user, sap.account.password) : null };
  setPlatform({
    env: () => ({}),
    backend: (id, entry) => (sourceOf(entry) === 'sap'
      ? odataBackend({ service: sapServiceOf(sap, entry.def.serviceKey), settings: { client: sap.client, timeoutMs: sap.timeoutMs } }, entry.def, contractOf(entry))
      : moduleLocalBackend(id, entry, memoryStateStore())),
    layouts: () => memoryLayoutStore()
  });
  let reason = '';
  if (!(await relayAnswers(sap.relayUrl))) reason = `the SAP relay at ${sap.relayUrl} does not answer. Start sap-relay and check the VPN.`;
  else if (!actor.sap) reason = 'no SAP account is set. Set SAP_USERNAME and SAP_PASSWORD (or VITE_SAP_USERNAME / VITE_SAP_PASSWORD in .env.local).';
  if (reason) console.warn(`Live SAP check skipped: ${reason}`);
  return { sap, actor, ready: !reason, reason };
}
