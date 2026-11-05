import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch, apiRequest, createEntity, entityPath, refFetch, service } from '@/ref/api-client';
import { parseRefPath } from '@/ref/api-client/http';
import { REF_ROUTES, translateRefPath } from '@/ref/routes';
import { installTestPlatform } from '../support/platform';

installTestPlatform();
interface Call { url: URL; init: RequestInit }
let calls: Call[];
let answer: (call: Call) => Response;
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const headersOf = (call: Call) => call.init.headers as Record<string, string>;

beforeEach(() => {
  calls = [];
  answer = () => json({ value: [] });
  vi.stubEnv('VITE_SAP_RELAY_URL', 'http://relay.test:3001');
  vi.stubEnv('VITE_SAP_USERNAME', 'TESTER');
  vi.stubEnv('VITE_SAP_PASSWORD', 'secret');
  vi.stubEnv('VITE_SAP_CLIENT', '100');
  vi.stubEnv('VITE_API_BASE_URL', 'http://backend.test:3200');
  vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
  vi.stubGlobal('fetch', async (url: string | URL, init: RequestInit = {}) => {
    const call = { url: new URL(String(url)), init };
    calls.push(call);
    return answer(call);
  });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('ref api-client routing', () => {
  it('parses a service address', () => {
    expect(parseRefPath("/api/fx/FxTransaction(A='1')?$top=2")).toEqual({ key: 'fx', path: "FxTransaction(A='1')", query: '$top=2' });
    expect(service('trmfxapp')('/TrmFxApp')).toBe('/api/trmfxapp/TrmFxApp');
    expect(() => parseRefPath('/other')).toThrow(ApiError);
  });

  it('sends a SAP key through the relay with sap-client and Basic auth (fx is the trmfx service)', async () => {
    const data = await apiFetch<{ value: unknown[] }>("/api/fx/FxTransaction?$top=2&$filter=CompanyCode eq '1000'");
    expect(data.value).toEqual([]);
    const call = calls[0]!;
    expect(call.url.origin).toBe('http://relay.test:3001');
    expect(call.url.pathname).toBe('/sap/opu/odata4/sap/zfs_sb_trmfx_o4_api/srvd_a2x/sap/zfs_sd_trmfx/0001/FxTransaction');
    expect(call.url.searchParams.get('sap-client')).toBe('100');
    expect(call.url.searchParams.get('$top')).toBe('2');
    expect(call.url.searchParams.get('$filter')).toBe("CompanyCode eq '1000'");
    expect(headersOf(call).authorization).toMatch(/^Basic /);
  });

  it('reaches the V2 services and the other SAP keys', async () => {
    await apiFetch('/api/companycode/A_CompanyCode?$top=1');
    await apiFetch('/api/trmfxapp/TrmFxApp');
    expect(calls[0]!.url.pathname).toBe('/sap/opu/odata/sap/API_COMPANYCODE_SRV/A_CompanyCode');
    expect(calls[1]!.url.pathname).toContain('zfs_sd_trmfxapp/0001/TrmFxApp');
  });

  it('writes with a CSRF token, If-Match and a JSON body, and returns the headers', async () => {
    answer = ({ init }) => (init.method === 'GET'
      ? new Response('', { headers: { 'x-csrf-token': 'tok' } })
      : json({}, 201, { 'OData-EntityId': "https://h/x/FxTransaction('77')" }));
    const r = await apiRequest('/api/fx/FxTransaction', { method: 'POST', body: { A: 1 }, headers: { 'If-Match': '*' } });
    expect(r.status).toBe(201);
    expect(r.headers.get('OData-EntityId')).toContain('77');
    const post = calls.at(-1)!;
    expect(post.init.method).toBe('POST');
    expect(post.init.body).toBe('{"A":1}');
    expect(headersOf(post)['x-csrf-token']).toBe('tok');
    expect(headersOf(post)['if-match']).toBe('*');
    const created = await createEntity('/api/fx/FxTransaction', { A: 1 }, 'FinancialTransaction');
    expect(created.key).toBe('77');
  });

  it("turns a SAP error into an ApiError with SAP's message and body", async () => {
    answer = () => json({ error: { code: 'X', message: 'Deal is locked' } }, 409);
    const error = await apiFetch('/api/fx/FxTransaction').catch((e: unknown) => e) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.message).toBe('Deal is locked');
    expect(error.status).toBe(409);
    expect((error.body as { error: { code: string } }).error.code).toBe('X');
  });

  it('refuses a key that is not a service', async () => {
    await expect(apiFetch('/api/nope/X')).rejects.toMatchObject({ status: 404 });
  });

  it('sends middleware and localdb to the BackEnd (/api/ref/<key>/<path>) with its headers, body as-is', async () => {
    answer = () => json({ rows: [{ A: '1' }] });
    const data = await apiFetch<{ rows: unknown[] }>('/api/middleware/data/masterContract?ZMC_STAT[in]=03,04&limit=500');
    expect(data.rows).toHaveLength(1);
    const mw = calls[0]!;
    expect(mw.url.origin).toBe('http://backend.test:3200');
    expect(mw.url.pathname).toBe('/api/ref/middleware/data/masterContract');
    expect(decodeURIComponent(mw.url.search)).toContain('ZMC_STAT[in]=03,04');
    expect(headersOf(mw)['x-app-request']).toBe('1');
    expect(headersOf(mw)['x-app-user']).toBe('TESTER');
    expect(mw.init.credentials).toBe('omit');

    await apiRequest('/api/localdb/tsf-limit/K1', { method: 'PUT', body: { X: 1 } });
    const db = calls[1]!;
    expect(db.url.pathname).toBe('/api/ref/localdb/tsf-limit/K1');
    expect(db.init.method).toBe('PUT');
    expect(db.init.body).toBe('{"X":1}');
  });

  it('reads the reference gateway error shape error.message.value from the ref routes', async () => {
    answer = () => json({ error: { message: { value: 'Not allowed' } } }, 403);
    await expect(apiFetch('/api/localdb/tsf-day-lock')).rejects.toMatchObject({ message: 'Not allowed', status: 403 });
  });

  it('answers notifications with a stub and sends nothing', async () => {
    await apiFetch('/api/notifications/email', { method: 'POST', body: {} });
    expect(calls).toHaveLength(0);
  });

  it('refFetch answers a Response (the $metadata probes)', async () => {
    answer = () => new Response('<edmx/>', { status: 200 });
    const response = await refFetch(service('fx')('$metadata'), { headers: { accept: 'application/xml' } });
    expect(await response.text()).toBe('<edmx/>');
    expect(calls[0]!.url.pathname.endsWith('/$metadata')).toBe(true);
  });

  it('builds entity paths as the reference does', () => {
    expect(entityPath('Bank', { A: "x'y" })).toBe("Bank(A='x''y')");
  });
});

describe('ref routes', () => {
  it('maps reference app ids to catalogue paths and translates reference addresses', () => {
    expect(REF_ROUTES['view-all-transactions']).toBe('/reporting/view-all-transactions');
    expect(translateRefPath('/reporting/fx-structure')).toBe('/reporting');
    expect(REF_ROUTES['fo-deal-id-details']).toBe(REF_ROUTES['deal-id-details']);
    expect(translateRefPath('/')).toBe('/fx-structure');
    expect(translateRefPath('/apps/ottk?display=1')).toBe(`${REF_ROUTES.ottk ?? '/fx-structure'}?display=1`);
    expect(translateRefPath('/fx-structure/a/b')).toBe('/fx-structure/a/b');
  });
});
