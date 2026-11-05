import { existsSync, readFileSync } from 'node:fs';
import type { PlaywrightTestConfig } from '@playwright/test';
import { connectPolicy } from '../../vite.config';
import { afterEach, describe, expect, it, vi } from 'vitest';

type WebServer = { command: string; url: string; env: Record<string, string> };
const services = JSON.parse(readFileSync('src/config/services.json', 'utf8')) as { key: string }[];
const variableOf = (s: { key: string }) => `SAP_${s.key.toUpperCase()}_URL`;
// An FE + BE + DB application starts its BackEnd too; a Front end only application has the FrontEnd alone.
const backEnd = existsSync('../BackEnd/package.json');

async function load(port: string, apiPort = ''): Promise<{ config: PlaywrightTestConfig; api: WebServer | undefined; web: WebServer }> {
  vi.resetModules();
  vi.stubEnv('E2E_PORT', port);
  vi.stubEnv('E2E_API_PORT', apiPort);
  const config = (await import('../../playwright.config')).default;
  const servers = config.webServer as unknown as WebServer[];
  expect(servers).toHaveLength(backEnd ? 2 : 1);
  return { config, api: backEnd ? servers[0] : undefined, web: servers[servers.length - 1] };
}

afterEach(() => { vi.unstubAllEnvs(); });

describe('playwright.config', () => {
  it('builds and previews the FrontEnd on 3300 when unset (never the dev port 3100)', async () => {
    const { config, web } = await load('');
    expect(config.use?.baseURL).toBe('http://127.0.0.1:3300');
    expect(web.command).toBe('npx vite build --mode test && npx vite preview');
    expect(web.url).toBe('http://127.0.0.1:3300/login');
    expect(web.env).toMatchObject({ FRONTEND_PORT: '3300', VITE_API_PORT: '3301', VITE_API_BASE_URL: '' });
  });
  it.runIf(backEnd)('builds and starts the BackEnd on 3301 when unset (never the dev port 3200), on an in-memory database', async () => {
    const { api } = await load('');
    expect(api!.command).toBe('npm --prefix ../BackEnd run build && node ../BackEnd/dist/server.mjs');
    expect(api!.url).toBe('http://127.0.0.1:3301/api/modules/sample-deals');
    expect(api!.env).toMatchObject({ PORT: '3301', APP_ORIGINS: 'http://127.0.0.1:3300', DB_PATH: ':memory:' });
  });
  it('takes E2E_PORT and E2E_API_PORT everywhere', async () => {
    const { config, api, web } = await load('3177', '3178');
    expect(config.use?.baseURL).toBe('http://127.0.0.1:3177');
    expect(web.url).toBe('http://127.0.0.1:3177/login');
    expect(web.env).toMatchObject({ FRONTEND_PORT: '3177', VITE_API_PORT: '3178' });
    if (api) {
      expect(api.url).toBe('http://127.0.0.1:3178/api/modules/sample-deals');
      expect(api.env).toMatchObject({ PORT: '3178', APP_ORIGINS: 'http://127.0.0.1:3177' });
    }
  });
  it('refuses an invalid E2E_PORT or E2E_API_PORT', async () => {
    await expect(load('80a')).rejects.toThrow('Invalid E2E_PORT');
    await expect(load('70000')).rejects.toThrow('Invalid E2E_PORT');
    await expect(load('', 'x')).rejects.toThrow('Invalid E2E_API_PORT');
  });
  it('runs in Microsoft Edge', async () => {
    const { config } = await load('');
    expect(config.projects).toHaveLength(1);
    expect(config.projects?.[0].name).toBe('edge');
    expect(config.projects?.[0].use?.channel).toBe('msedge');
  });
  it('points the browser at the relay stub and passes no SAP service URL, SAP account or login', async () => {
    const { api, web } = await load('');
    expect(services.length).toBeGreaterThan(0);
    expect(web.env.VITE_SAP_RELAY_URL).toBe('http://127.0.0.1:3399');
    for (const s of services) expect(web.env).not.toHaveProperty(`VITE_${variableOf(s)}`);
    expect(Object.keys(web.env).filter(k => /^VITE_SAP_\w+_URL$/.test(k))).toEqual(['VITE_SAP_RELAY_URL']);
    if (api) {
      expect(Object.keys(api.env).filter(k => /^SAP_|^APP_(USER|PASSWORD)/.test(k))).toEqual([]);
      expect(api.env).toMatchObject({ DB_PATH: ':memory:' });
    }
  });
});

describe('the built page Content-Security-Policy', () => {
  const connect = (env: Record<string, string>, appType: 'fullstack' | 'frontend') =>
    /connect-src ([^;]*)/.exec(connectPolicy(env, appType))![1].split(' ');
  it('never allows the page own origin to be called, and allows the default relay', () => {
    for (const appType of ['fullstack', 'frontend'] as const) {
      const sources = connect({}, appType);
      expect(sources).not.toContain("'self'");
      expect(sources).toContain('http://localhost:3001');
    }
  });
  it('allows the BackEnd origins only in an FE + BE + DB application, and the configured relay instead of the default', () => {
    expect(connect({ VITE_API_PORT: '3301' }, 'fullstack')).toEqual(expect.arrayContaining(['http://127.0.0.1:3301', 'http://localhost:3301']));
    expect(connect({ VITE_API_PORT: '3301' }, 'frontend').join(' ')).not.toContain('3301');
    expect(connect({ VITE_API_BASE_URL: 'https://api.example.com/x' }, 'fullstack')).toContain('https://api.example.com');
    const relay = connect({ VITE_SAP_RELAY_URL: 'http://127.0.0.1:3399' }, 'frontend');
    expect(relay).toContain('http://127.0.0.1:3399');
    expect(relay).not.toContain('http://localhost:3001');
  });
});
