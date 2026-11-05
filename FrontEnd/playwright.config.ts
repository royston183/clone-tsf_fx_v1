import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Runs the production builds in Microsoft Edge: the FrontEnd on E2E_PORT (default 3300) and, in an FE + BE + DB
// application, the BackEnd on E2E_API_PORT (default 3301), so a running `npm run dev` (3100 / 3200) is never touched.
// The SAP relay is a stub on 127.0.0.1:3399 that the tests answer with page.route (tests/e2e/support.ts); the build
// gets no SAP account from .env.local (a value in the process environment, even an empty one, is never replaced by it),
// so e2e never reaches the real relay (3001) or SAP. The BackEnd keeps its data in memory: every run starts from the
// sample data.
function portOf(name: string, fallback: string): number {
  const raw = process.env[name]?.trim() || fallback;
  if (!/^[1-9]\d{0,4}$/.test(raw) || Number(raw) > 65535) throw new Error(`Invalid ${name} "${raw}": use a whole number from 1 to 65535.`);
  return Number(raw);
}
const port = portOf('E2E_PORT', '3300');
const apiPort = portOf('E2E_API_PORT', '3301');
const RELAY = 'http://127.0.0.1:3399';
const origin = `http://127.0.0.1:${port}`;
const backEnd = existsSync('../BackEnd/package.json');

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  use: { baseURL: origin, trace: { mode: 'retain-on-failure', screenshots: false, snapshots: false, sources: true } },
  projects: [{ name: 'edge', use: { ...devices['Desktop Edge'], channel: 'msedge', viewport: { width: 1440, height: 900 } } }],
  webServer: [
    ...(backEnd ? [{
      command: `npm --prefix ../BackEnd run build && node ../BackEnd/dist/server.mjs`,
      url: `http://127.0.0.1:${apiPort}/api/modules/sample-deals`,
      timeout: 300000,
      reuseExistingServer: false,
      env: {
        // The UI Gallery and its sample modules (Deals, the reports) are for developers: off in production once a module
        // reads SAP, so e2e builds and runs with NODE_ENV=development (the e2e specs need them).
        NODE_ENV: 'development', DB_PATH: ':memory:', PORT: String(apiPort), APP_ORIGINS: origin
      }
    }] : []),
    {
      command: 'npx vite build --mode test && npx vite preview',
      url: `${origin}/login`,
      timeout: 300000,
      reuseExistingServer: false,
      // The SAP relay is a stub answered by the tests (tests/e2e/support.ts): nothing here can reach the real relay.
      env: { NODE_ENV: 'development', VITE_SAP_RELAY_URL: RELAY, VITE_SAP_USERNAME: '', VITE_SAP_PASSWORD: '', VITE_SAP_CLIENT: '', FRONTEND_PORT: String(port), VITE_API_PORT: String(apiPort), VITE_API_BASE_URL: '' }
    }
  ]
});
