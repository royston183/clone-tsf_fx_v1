import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setPlatform } from '@core/platform';
import { getConfig, resetConfig } from '@core/server/config';
import { layoutService } from '@core/server/layout-service';
import { resetModuleBackends } from '@core/server/module-service';
import { loadSapConfig } from '@core/sap/config';
import { browserActor, browserPlatform } from '@/lib/client/browser-platform';
import { backendApi } from '@/lib/client/backend-api';
import { inPage, LOCAL_ERROR, layoutsList, layoutsSave, moduleView, remote, remoteLayouts } from '@/lib/client/data';
import { HttpError } from '@/lib/errors';
import { SERVER_MODULES } from '@/modules/server-registry';
import { FIXTURE_SERVICE, FIXTURES, registerFixtureModules } from '../support/fixtures';
import { stubLocalStorage, stubSessionStorage } from '../support/storage';

// The kind of application the data client is built for (src/runtime.ts): each describe block below sets it, so these
// tests hold in an FE + BE + DB copy and in a Front end only one alike. They run on the test-* fixtures.
const runtime = vi.hoisted(() => ({ APP_TYPE: 'fullstack' as 'fullstack' | 'frontend' }));
vi.mock('@/runtime', () => ({ get APP_TYPE() { return runtime.APP_TYPE; } }));
registerFixtureModules();
const SAP = FIXTURES.sap.id, APP = FIXTURES.app.id, SAMPLE = FIXTURES.sample.id, LINES = FIXTURES.lines.id;

// The page is served from 127.0.0.1:3100; the BackEnd is on 3200; the SAP relay on localhost:3001 (the default).
const PAGE = 'http://127.0.0.1:3100';
const RELAY = 'http://localhost:3001/';
const BACKEND = 'http://127.0.0.1:3200/';
interface Call { url: string; init?: RequestInit }
let calls: Call[];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** fetch as the browser sees it: the relay answers every read with no rows; the BackEnd is up or down. */
function stubFetch(backend: 'up' | 'down'): void {
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    calls.push({ url, init });
    if (url.startsWith(RELAY)) return json({ value: [] });
    if (url.startsWith(BACKEND)) {
      if (backend === 'down') throw new TypeError('Failed to fetch');
      return json({ mode: 'local', service: null, tables: {}, lookups: { from: 'backend' } });
    }
    throw new TypeError(`Unexpected fetch ${url}`);
  }));
}

function start(appType: 'fullstack' | 'frontend' = runtime.APP_TYPE): void {
  setPlatform(browserPlatform(loadSapConfig({}), appType));
  resetConfig();
  resetModuleBackends();
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  stubSessionStorage();
  vi.stubGlobal('location', { origin: PAGE, protocol: 'http:', hostname: '127.0.0.1', host: '127.0.0.1:3100' });
  start();
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); runtime.APP_TYPE = 'fullstack'; });

const LAYOUT = { columns: ['code', 'amount', 'currency'], sort: [], subtotals: [], unit: null, subtotalsOnly: false };
const withSapAccount = () => { vi.stubEnv('VITE_SAP_USERNAME', 'tester'); vi.stubEnv('VITE_SAP_PASSWORD', 'secret'); };

describe('the data client (FE + BE + DB)', () => {
  beforeEach(() => { runtime.APP_TYPE = 'fullstack'; start(); });

  it('routes by source: sample modules and SAP modules in the page, app modules to the BackEnd', () => {
    expect(remote(SAP)).toBe(false);
    expect(remote(SAMPLE)).toBe(false);
    expect(remote(APP)).toBe(true);
    expect(remoteLayouts(SAMPLE)).toBe(false);
    expect(remoteLayouts(APP)).toBe(true);
    expect(remoteLayouts(SAP)).toBe(true);
  });

  it('a module on sample data makes no request at all', async () => {
    stubFetch('up');
    const view = await moduleView(SAMPLE);
    expect(view.mode).toBe('local');
    expect(calls).toEqual([]);
  });

  it('a SAP module calls only the relay, never the page or the BackEnd', async () => {
    withSapAccount();
    stubFetch('up');
    const view = await moduleView(SAP);
    expect(view.mode).toBe('odata');
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(c.url.startsWith(RELAY), c.url).toBe(true);
    // The relay keeps SAP's cookies: the browser sends none.
    for (const c of calls) expect(c.init?.credentials).toBe('omit');
    expect(String(calls[0].url)).toContain('sap-client=100');
  });

  it('an app module goes to the BackEnd with the acting user (DEMO without a SAP user)', async () => {
    stubFetch('up');
    const view = await moduleView(APP);
    expect(view.lookups).toEqual({ from: 'backend' });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`http://127.0.0.1:3200/api/modules/${APP}`);
    const headers = new Headers(calls[0].init?.headers);
    expect(headers.get('x-app-user')).toBe('DEMO');
    expect(headers.get('x-app-request')).toBe('1');
    expect(calls[0].init?.credentials).toBe('omit');
  });

  it('sends the SAP user as the acting user', async () => {
    withSapAccount();
    stubFetch('up');
    await moduleView(APP);
    expect(new Headers(calls[0].init?.headers).get('x-app-user')).toBe('TESTER');
  });

  it('with the BackEnd down, SAP and sample screens still work; app screens say the BackEnd is unreachable', async () => {
    withSapAccount();
    stubFetch('down');
    await expect(moduleView(SAP)).resolves.toMatchObject({ mode: 'odata' });
    await expect(moduleView(SAMPLE)).resolves.toMatchObject({ mode: 'local' });
    await expect(moduleView(APP)).rejects.toMatchObject({ status: 503, message: 'Cannot reach the BackEnd.' });
    await expect(layoutsList(SAP)).rejects.toThrow('Cannot reach the BackEnd.');
  });

  it('layouts of a module with no source stay in memory: not in localStorage, not sent to the BackEnd', async () => {
    const local = stubLocalStorage();
    stubFetch('up');
    expect(SERVER_MODULES[LINES].source).toBeUndefined();
    const saved = await layoutsSave(LINES, { name: 'Mine', description: '', scope: 'personal', isDefault: false, layout: LAYOUT });
    expect(saved.layouts.map(l => l.name)).toEqual(['Mine']);
    expect((await layoutsList(LINES)).layouts.map(l => l.name)).toEqual(['Mine']);
    expect([...local.keys()]).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('never calls the page\'s own origin', async () => {
    withSapAccount();
    stubFetch('up');
    await moduleView(SAP);
    await moduleView(APP);
    await moduleView(SAMPLE);
    expect(calls.filter(c => c.url.startsWith(PAGE))).toEqual([]);
  });
});

describe('the data client (Front end only)', () => {
  beforeEach(() => { runtime.APP_TYPE = 'frontend'; start(); });

  it('answers every module in the page: nothing goes to a BackEnd', () => {
    for (const id of [SAP, APP, SAMPLE]) {
      expect(remote(id), id).toBe(false);
      expect(remoteLayouts(id), id).toBe(false);
    }
  });

  it('an app module keeps its data in this browser, and SAP modules call only the relay', async () => {
    stubLocalStorage();
    withSapAccount();
    stubFetch('down');
    await expect(moduleView(APP)).resolves.toMatchObject({ mode: 'local' });
    await expect(moduleView(SAMPLE)).resolves.toMatchObject({ mode: 'local' });
    await expect(moduleView(SAP)).resolves.toMatchObject({ mode: 'odata' });
    for (const c of calls) expect(c.url.startsWith(RELAY), c.url).toBe(true);
  });

  it('keeps the layouts of a module with a source in this browser', async () => {
    const local = stubLocalStorage();
    stubFetch('down');
    const entry = SERVER_MODULES[LINES];
    SERVER_MODULES[LINES] = { ...entry, source: 'sap' };
    try {
      resetModuleBackends();
      await layoutsSave(LINES, { name: 'Mine', description: '', scope: 'personal', isDefault: false, layout: LAYOUT });
      expect((await layoutsList(LINES)).layouts.map(l => l.name)).toEqual(['Mine']);
      expect(local.has(`app-db:layouts:${LINES}`)).toBe(true);
      expect(calls).toEqual([]);
    } finally { SERVER_MODULES[LINES] = entry; }
  });
});

describe('errors of a branch run in the page', () => {
  it('an HttpError passes unchanged (status, message and details)', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const refused = new HttpError(422, 'Some rows need attention.', [{ row: 1, message: 'x' }]);
    await expect(inPage(async () => { throw refused; })).rejects.toBe(refused);
    await expect(moduleView('no-such-module')).rejects.toMatchObject({ status: 404, message: 'Unknown application.' });
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
  it('any other error is logged and becomes a generic 500, like the BackEnd answers it', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bug = new TypeError("Cannot read properties of undefined (reading 'rows')");
    setPlatform({ env: () => ({}), backend: () => { throw bug; }, layouts: () => { throw bug; } });
    resetModuleBackends();
    const failure = moduleView(SAMPLE);
    await expect(failure).rejects.toBeInstanceOf(HttpError);
    await expect(failure).rejects.toMatchObject({ status: 500, message: LOCAL_ERROR });
    expect(LOCAL_ERROR).toBe('Something went wrong. Try again.');
    expect(error).toHaveBeenCalledWith(bug);
    await expect(inPage(() => { throw new Error('sync'); })).rejects.toMatchObject({ status: 500, message: LOCAL_ERROR });
    error.mockRestore();
  });
});

describe('backendApi', () => {
  it('uses VITE_API_BASE_URL when set, and the BackEnd\'s error message and details', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example/');
    calls = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return json({ error: { message: 'Some rows need attention.', details: [{ row: 1, field: 'deal', message: 'x' }] } }, 422);
    }));
    await expect(backendApi(`/modules/${APP}/x`, { method: 'POST', body: { rows: [] } }))
      .rejects.toMatchObject({ status: 422, message: 'Some rows need attention.', details: [{ row: 1, field: 'deal', message: 'x' }] });
    expect(calls[0].url).toBe(`https://api.example/api/modules/${APP}/x`);
    expect(new Headers(calls[0].init?.headers).get('content-type')).toBe('application/json');
    expect(calls[0].init?.body).toBe('{"rows":[]}');
  });
  it('explains an answer that is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Bad gateway</html>', { status: 502 })));
    await expect(backendApi(`/modules/${APP}`)).rejects.toMatchObject({ status: 502, message: 'The BackEnd did not return JSON (HTTP 502).' });
  });
});

describe('the browser platform', () => {
  it('acts as the tab\'s SAP user, else DEMO', () => {
    expect(browserActor()).toMatchObject({ id: 'tab|DEMO', username: 'DEMO', sap: null });
    withSapAccount();
    expect(browserActor()).toMatchObject({ id: 'tab|TESTER', username: 'TESTER' });
    expect(browserActor().sap).not.toBeNull();
  });

  it('keeps the layouts of a module on sample data in memory, never in browser storage', async () => {
    const local = stubLocalStorage();
    start('frontend');
    expect((await layoutService(getConfig(), LINES).list(browserActor())).layouts).toEqual([]);
    const store = browserPlatform(loadSapConfig({}), 'frontend').layouts(LINES, SERVER_MODULES[LINES]);
    await store.save([]);
    expect([...local.keys()]).toEqual([]);
  });

  it('Front end only: an app module keeps its data and layouts in localStorage', async () => {
    const local = stubLocalStorage();
    start('frontend');
    const entry = SERVER_MODULES[APP];
    const platform = browserPlatform(loadSapConfig({}), 'frontend');
    const backend = platform.backend(APP, entry);
    expect(backend.mode).toBe('local');
    await backend.apply(browserActor(), 'items', []);
    expect(JSON.parse(local.get(`app-db:data:${APP}`) ?? 'null').tables.items.length).toBeGreaterThan(0);
    await platform.layouts(APP, entry).save([]);
    expect(local.get(`app-db:layouts:${APP}`)).toBe('[]');
  });

  it('keeps a SAP module backend per service root and the SAP client of the tab', () => {
    const platform = browserPlatform(loadSapConfig({}), 'fullstack');
    const scope = platform.scope!(SERVER_MODULES[SAP]);
    expect(scope).toBe(`${RELAY}${FIXTURE_SERVICE.path.slice(1)}|100`);
    vi.stubEnv('VITE_SAP_CLIENT', '200');
    expect(platform.scope!(SERVER_MODULES[SAP])).toBe(scope.replace('|100', '|200'));
    expect(platform.scope!(SERVER_MODULES[SAMPLE])).toBe('');
  });

  it('FE + BE + DB: an app module is never answered in the page', () => {
    const entry = SERVER_MODULES[APP];
    expect(() => browserPlatform(loadSapConfig({}), 'fullstack').backend(APP, entry)).toThrow();
  });
});
