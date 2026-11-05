import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { THEME_SCRIPT } from './src/lib/client/theme-script.ts';
import { BACK_GUARD_SCRIPT } from './src/lib/object/history.ts';

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// The core (SAP layer, services, API router) sits in src/core; the BackEnd shares it through its own @core alias.
export const CORE_DIR = at('./src/core/');
export const alias = [
  { find: /^@\//, replacement: at('./src/') },
  { find: /^@core\//, replacement: CORE_DIR }
];

/** FRONTEND_PORT (PORT when FS Sprint sets one), default 3100. Throws on a value that is not a port. */
export function frontendPort(env: Record<string, string | undefined>): number {
  const raw = (env.FRONTEND_PORT ?? env.PORT ?? '').trim();
  const port = raw === '' ? 3100 : /^[1-9]\d{0,4}$/.test(raw) ? Number(raw) : NaN;
  if (!(port >= 1 && port <= 65535)) throw new Error(`Invalid FRONTEND_PORT "${raw}": use a whole number from 1 to 65535.`);
  return port;
}

/** The theme and Back-guard scripts run in <head>, before the first paint and before the app's own listeners. */
const headScripts = (): Plugin => ({
  name: 'head-scripts',
  transformIndexHtml: () => [THEME_SCRIPT, BACK_GUARD_SCRIPT].map(children => ({ tag: 'script', children, injectTo: 'head-prepend' as const }))
});

const DEFAULT_RELAY = 'http://localhost:3001';
/** 'fullstack' or 'frontend', as scripts/new-application.ps1 sets it in src/runtime.ts. */
const appType = (): 'fullstack' | 'frontend' => (/APP_TYPE = 'frontend'/.test(readFileSync(at('./src/runtime.ts'), 'utf8')) ? 'frontend' : 'fullstack');

/**
 * The built page's Content-Security-Policy: scripts and styles from this site. The page never calls its own origin for
 * data, so connect-src has no 'self': it lists the SAP relay (VITE_SAP_RELAY_URL, default http://localhost:3001) and,
 * in an FE + BE + DB application only, the BackEnd.
 */
export function connectPolicy(env: Record<string, string>, type: 'fullstack' | 'frontend'): string {
  const api = type === 'fullstack' ? [env.VITE_API_BASE_URL?.trim() ? new URL(env.VITE_API_BASE_URL.trim()).origin : `http://127.0.0.1:${env.VITE_API_PORT || 3200} http://localhost:${env.VITE_API_PORT || 3200}`] : [];
  const relay = env.VITE_SAP_RELAY_URL?.trim() ? new URL(env.VITE_SAP_RELAY_URL.trim()).origin : DEFAULT_RELAY;
  return [
    "default-src 'self'", "script-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data:",
    "font-src 'self' data:", `connect-src ${[...api, relay].join(' ')}`, "base-uri 'self'", "form-action 'self'"
  ].join('; ');
}

const csp = (env: Record<string, string>): Plugin => {
  const policy = connectPolicy(env, appType());
  return { name: 'csp', apply: 'build', transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' }] };
};

export default defineConfig(({ mode }) => {
  // .env.local sits in the application root, beside FrontEnd/ and BackEnd/; only VITE_* values reach the browser.
  const env = { ...loadEnv(mode, at('..'), 'VITE_'), ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('VITE_'))) } as Record<string, string>;
  const port = frontendPort(process.env);
  return {
    plugins: [react(), headScripts(), csp(env)],
    envDir: at('..'),
    resolve: { alias },
    // 127.0.0.1 only: a local build carries the default SAP account from .env.local (VITE_SAP_*) in the page.
    server: { host: '127.0.0.1', port, strictPort: true, warmup: { clientFiles: ['./src/components/dashboard/DashboardView.tsx'] } },
    preview: { host: '127.0.0.1', port, strictPort: true },
    build: { outDir: 'dist', target: 'es2022', sourcemap: true, emptyOutDir: true }
  };
});
