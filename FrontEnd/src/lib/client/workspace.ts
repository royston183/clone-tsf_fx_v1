// The workspace as this tab sees it: the app login, the tab's SAP account and what the last SAP check found. Built in
// the browser (no request); SAP is checked only when the person asks (Settings → SAP Connection).
import { checkService, isRejected, REJECTED_MESSAGE } from '@core/sap/client';
import { galleryOn } from '@core/server/config';
import { NO_SAP_ACCOUNT } from '@core/server/backend';
import { HttpError } from '@/lib/errors';
import type { SessionInfo, WorkspaceInfo } from '@/lib/workspace-types';
import { SERVER_MODULES, sourceOf } from '@/modules/server-registry';
import { signedInUser } from './app-login';
import { browserConfig } from './browser-platform';
import { actingUser, buildConfig, checkAnyService, currentAccount, sapConnection, sapSettings, testAndSave, type CheckResult, type SapAccount } from './sap-account';

/** The application reads or writes SAP: at least one module's data is inside SAP. */
export const usesSap = (): boolean => Object.values(SERVER_MODULES).some(m => sourceOf(m) === 'sap');

// The last SAP check of this tab, for the account it was made with.
let last: { account: string; connected: boolean; error: string; checkedAt: string } | null = null;
const accountKey = (a: SapAccount = currentAccount()) => JSON.stringify([a.username.toUpperCase(), a.password, a.client]);
const remember = (connected: boolean, error: string) => { last = { account: accountKey(), connected, error, checkedAt: new Date().toISOString() }; };

function sapState(): Pick<SessionInfo, 'sapStatus' | 'sapError' | 'checkedAt'> {
  const conn = sapConnection();
  if (!usesSap() || !conn) return { sapStatus: 'none', sapError: '', checkedAt: null };
  const seen = last?.account === accountKey() ? last : null;
  // SAP rejected this account: further calls are paused until the person tests it again.
  if (isRejected(conn)) return { sapStatus: 'unavailable', sapError: REJECTED_MESSAGE, checkedAt: seen?.checkedAt ?? null };
  if (!seen) return { sapStatus: 'none', sapError: '', checkedAt: null };
  return { sapStatus: seen.connected ? 'connected' : 'unavailable', sapError: seen.error, checkedAt: seen.checkedAt };
}

export function workspaceInfo(): WorkspaceInfo {
  const sap = buildConfig();
  const user = signedInUser();
  const account = currentAccount();
  return {
    session: user ? { username: user, sapUsername: account.username.toUpperCase(), actingUser: actingUser(), ...sapState() } : null,
    systemId: sap.systemId,
    client: account.client,
    relayUrl: sap.relayUrl,
    usesSap: usesSap(),
    services: Object.values(sap.services).map(s => ({ key: s.key, title: s.title, binding: s.binding, path: s.path, url: s.base })),
    gallery: galleryOn(browserConfig())
  };
}

/** Tests the tab's account on the first configured service SAP has published, and remembers the answer. */
export async function checkSapAccount(): Promise<CheckResult> {
  if (!sapConnection()) throw new HttpError(400, NO_SAP_ACCOUNT);
  try {
    const result = await checkAnyService(sapSettings(), sapConnection()!);
    remember(true, '');
    return result;
  } catch (error) {
    remember(false, (error as Error).message);
    throw error;
  }
}

/** Tests one SAP service with the tab's account (a paused account is retried once) and remembers the answer. */
export async function checkSapService(key: string): Promise<CheckResult> {
  const service = Object.hasOwn(buildConfig().services, key) ? buildConfig().services[key] : undefined;
  if (!service) throw new HttpError(404, `Unknown SAP service ${key}.`);
  if (!sapConnection()) throw new HttpError(400, NO_SAP_ACCOUNT);
  try {
    const result = await checkService(sapSettings(), sapConnection()!, { key: service.key, base: service.base }, { retry: true });
    remember(true, '');
    return result;
  } catch (error) {
    remember(false, (error as Error).message);
    throw error;
  }
}

/** Tests the SAP account and saves it for this tab on success (Settings → SAP Connection → Test & save). */
export async function saveSapAccount(account: { username: string; password: string; client?: string }): Promise<CheckResult> {
  const result = await testAndSave(account);
  remember(true, '');
  return result;
}
