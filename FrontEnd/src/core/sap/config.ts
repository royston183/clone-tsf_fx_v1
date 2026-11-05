import { z } from 'zod';
import { SERVICES } from '@/config/services';
import { HttpError } from '@/lib/errors';
import type { SapService } from './client';

// The browser's SAP settings: the local relay, the SAP client, the timeout and the build's default SAP account.
// Read from VITE_* build values (prefix stripped by viteEnv). The relay is built separately; it runs on this PC.

export interface SapServiceConfig { key: string; title: string; binding: string; path: string; base: string }
export interface SapConfig {
  relayUrl: string;
  client: string;
  timeoutMs: number;
  systemId: string;
  account: { username: string; password: string };
  services: Record<string, SapServiceConfig>;
}

const DEFAULT_RELAY = 'http://localhost:3001';
const blank = (v: unknown) => (typeof v === 'string' ? (v.trim() === '' ? undefined : v.trim()) : v);
const text = z.preprocess(blank, z.string().optional());
const schema = z.object({
  SAP_RELAY_URL: text,
  SAP_CLIENT: z.preprocess(blank, z.string().regex(/^\d{3}$/, 'must have three digits').optional()),
  SAP_TIMEOUT_MS: z.preprocess(blank, z.coerce.number().int().positive().optional()),
  SAP_SYSTEM_ID: text,
  SAP_USERNAME: text,
  SAP_PASSWORD: text
});

function relayOrigin(value: string | undefined): URL {
  let url: URL;
  try { url = new URL(value ?? DEFAULT_RELAY); } catch { throw new Error('Invalid SAP_RELAY_URL: not a URL.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Invalid SAP_RELAY_URL: use an HTTP(S) address without credentials or query parameters.');
  }
  return url;
}

/** Reads and validates the settings. Throws with the variable name when a value is wrong. */
export function loadSapConfig(env: Record<string, string | undefined>): SapConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`Invalid ${issue.path.join('.')}: ${issue.message}`);
  }
  const e = parsed.data;
  const relay = relayOrigin(e.SAP_RELAY_URL);
  return {
    relayUrl: relay.origin,
    client: e.SAP_CLIENT ?? '100',
    timeoutMs: e.SAP_TIMEOUT_MS ?? 30000,
    systemId: e.SAP_SYSTEM_ID ?? 'SAP',
    account: { username: e.SAP_USERNAME ?? '', password: e.SAP_PASSWORD ?? '' },
    services: Object.fromEntries(SERVICES.map(s => {
      const base = new URL(s.path, relay.origin).href;
      return [s.key, { ...s, base: base.replace(/\/*$/, '/') }];
    }))
  };
}

/** One SAP service on the relay; 404 for a key that is not in services.json. */
export function sapServiceOf(cfg: SapConfig, key: string): SapService {
  const s = Object.hasOwn(cfg.services, key) ? cfg.services[key] : undefined;
  if (!s) throw new HttpError(404, `Unknown SAP service ${key}.`);
  return { key: s.key, base: s.base };
}

/** VITE_* build settings as the SAP variable names (VITE_SAP_RELAY_URL → SAP_RELAY_URL). */
export function viteEnv(vite: Record<string, unknown>): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vite)) if (k.startsWith('VITE_') && typeof v === 'string') env[k.slice(5)] = v;
  return env;
}
