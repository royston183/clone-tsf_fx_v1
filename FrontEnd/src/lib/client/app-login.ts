import { clearSapAccount } from './sap-account';

// The application login, checked in this browser: demo / demo. The signed-in user lives in this tab's sessionStorage
// (a reload keeps it, a new tab starts signed out).
const DEMO = 'demo';
export const APP_LOGIN = { username: DEMO, password: DEMO } as const;
const KEY = 'app-signed-in';

export function signIn(username: string, password: string): boolean {
  if (username.trim().toLowerCase() !== APP_LOGIN.username || password !== APP_LOGIN.password) return false;
  try { sessionStorage.setItem(KEY, JSON.stringify({ username: APP_LOGIN.username })); } catch { /* storage blocked: signed out after a reload */ }
  return true;
}

export function signedInUser(): string | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as { username?: unknown } | null;
    return typeof saved?.username === 'string' && saved.username ? saved.username : null;
  } catch { return null; }
}

/** Signs out of the application and forgets this tab's SAP account. */
export function signOut(): void {
  try { sessionStorage.removeItem(KEY); } catch { /* storage blocked */ }
  clearSapAccount();
}
