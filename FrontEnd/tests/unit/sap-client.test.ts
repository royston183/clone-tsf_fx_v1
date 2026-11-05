import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkService, isRejected, newSapConnection, readAll, REJECTED_MESSAGE, sapRequest, type SapService } from '@core/sap/client';
import { startMockSap, type MockSap } from '../support/mock-sap';
import { installTestPlatform } from '../support/platform';

installTestPlatform();

const settings = { client: '100', timeoutMs: 3000 };
let sap: MockSap;
let service: SapService;
beforeEach(async () => { sap = await startMockSap({ pageSize: 1 }); service = { key: 'timebuckets', base: sap.base }; });
afterEach(async () => { await sap.close(); });
const conn = () => newSapConnection('TESTER', 'secret');

describe('reads', () => {
  it('pages through nextLink with sap-client once per call', async () => {
    const rows = await readAll(settings, conn(), service, 'Alm1Bucket', { pageSize: 5000 });
    expect(rows.map(r => r.Bucket)).toEqual(['B01', 'B02']);
    const reads = sap.log.filter(r => r.rel === 'Alm1Bucket');
    expect(reads).toHaveLength(2);
    for (const r of reads) expect(r.query.getAll('sap-client')).toEqual(['100']);
    expect(sap.log.some(r => r.headers['x-csrf-token'])).toBe(false);
  });
  it('uses server-driven paging and asks SAP for the total, never $top', async () => {
    await readAll(settings, conn(), service, 'Alm1Bucket', { pageSize: 5000 });
    const first = sap.log.find(r => r.rel === 'Alm1Bucket');
    expect(first?.query.has('$top')).toBe(false);
    expect(first?.query.get('$count')).toBe('true');
    expect(first?.headers.prefer).toBe('odata.maxpagesize=5000');
  });
  it('fails when SAP returns fewer rows than it counted', async () => {
    await sap.close();
    sap = await startMockSap({ countExtra: 1 });
    service = { key: 'timebuckets', base: sap.base };
    await expect(readAll(settings, conn(), service, 'Alm1Bucket')).rejects.toThrow('SAP returned 2 of 3 Alm1Bucket rows');
  });
  it('refuses to truncate when the page limit is reached', async () => {
    await expect(readAll(settings, conn(), service, 'Alm1Bucket', { maxPages: 1 })).rejects.toThrow('narrow the query');
  });
  it('reports a non-JSON answer clearly', async () => {
    sap.htmlNext();
    await expect(readAll(settings, conn(), service, 'Alm1Bucket')).rejects.toThrow('SAP did not return JSON for Alm1Bucket');
  });
  it('checks a service through $metadata', async () => {
    await expect(checkService(settings, conn(), service)).resolves.toMatchObject({ service: 'timebuckets', connected: true });
  });
});

describe('writes', () => {
  it('fetches a CSRF token once and sends it, with no cookie (the relay keeps the SAP session)', async () => {
    const c = conn();
    expect((await sapRequest(settings, c, service, { method: 'POST', path: 'Alm1Bucket', body: JSON.stringify({ Bucket: 'B09' }) })).status).toBe(201);
    expect((await sapRequest(settings, c, service, { method: 'POST', path: 'Alm1Bucket', body: JSON.stringify({ Bucket: 'B10' }) })).status).toBe(201);
    expect(sap.log.filter(r => r.headers['x-csrf-token'] === 'Fetch')).toHaveLength(1);
    for (const p of sap.log.filter(r => r.method === 'POST')) {
      expect(p.headers.cookie).toBeUndefined();
      expect(p.headers['x-csrf-token']).toMatch(/^tok-/);
    }
  });
  it('refetches an expired token and retries once', async () => {
    const c = conn();
    await sapRequest(settings, c, service, { method: 'POST', path: 'Alm1Bucket', body: JSON.stringify({ Bucket: 'B09' }) });
    sap.expireToken();
    const r = await sapRequest(settings, c, service, { method: 'POST', path: 'Alm1Bucket', body: JSON.stringify({ Bucket: 'B10' }) });
    expect(r.status).toBe(201);
    expect(sap.log.filter(x => x.headers['x-csrf-token'] === 'Fetch')).toHaveLength(2);
  });
});

describe('failures', () => {
  it('stops calling SAP after a rejected logon until an explicit retry', async () => {
    const bad = newSapConnection('TESTER', 'wrong');
    await expect(checkService(settings, bad, service)).rejects.toThrow('SAP rejected the user name or password.');
    expect(isRejected(bad)).toBe(true);
    const before = sap.log.length;
    await expect(readAll(settings, bad, service, 'Alm1Bucket')).rejects.toThrow(REJECTED_MESSAGE);
    expect(sap.log.length).toBe(before);
    await expect(checkService(settings, bad, service, { retry: true })).rejects.toThrow('SAP rejected');
    expect(sap.log.length).toBe(before + 1);
  });
  it('refuses redirects (interactive SSO)', async () => {
    sap.redirectNext();
    await expect(sapRequest(settings, conn(), service, { path: 'Alm1Bucket' })).rejects.toThrow('SAP redirected the request');
  });
  it('reports an unreachable host', async () => {
    const closed = { key: 'x', base: 'http://127.0.0.1:9/sap/opu/odata4/sap/x/srvd_a2x/sap/x/0001/' };
    // Windows retries a refused connection for about 2 s, so allow more than the default test timeout here.
    await expect(sapRequest({ client: '100', timeoutMs: 10000 }, conn(), closed, { path: 'X' })).rejects.toThrow('Cannot reach the SAP relay at http://127.0.0.1:9');
  });
  it('caps the response size', async () => {
    await expect(sapRequest(settings, conn(), service, { path: 'Alm1Bucket', maxBytes: 10 })).rejects.toThrow('SAP response exceeds');
  });
});

describe('network failure', () => {
  it('names the SAP relay', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (() => Promise.reject(new TypeError('fetch failed'))) as typeof fetch;
    try {
      await expect(sapRequest(settings, conn(), { key: 'timebuckets', base: 'http://localhost:3001/sap/x/' }, { path: 'Alm1Bucket' }))
        .rejects.toThrow('Cannot reach the SAP relay at http://localhost:3001. Start sap-relay and check the VPN.');
    } finally { globalThis.fetch = original; }
  });
});

describe('browser opaque redirect', () => {
  // With `redirect: 'manual'` a browser hides the 3xx: the response has type 'opaqueredirect', status 0 and no body.
  const opaque = () => {
    const calls: { method: string; token: string | undefined }[] = [];
    const fake = ((_url: URL, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      calls.push({ method: init.method ?? 'GET', token: headers['x-csrf-token'] });
      if (headers['x-csrf-token'] === 'Fetch') return Promise.resolve(new Response('', { status: 200, headers: { 'x-csrf-token': 'tok-1' } }));
      return Promise.resolve({ type: 'opaqueredirect', status: 0, ok: false, headers: new Headers(), body: null } as unknown as Response);
    }) as unknown as typeof fetch;
    return { calls, fake };
  };
  const relay = { key: 'timebuckets', base: 'http://relay.invalid/sap/x/' };
  it('treats it as a redirect error on a read', async () => {
    const original = globalThis.fetch;
    const { fake } = opaque();
    globalThis.fetch = fake;
    try {
      await expect(sapRequest(settings, conn(), relay, { path: 'Alm1Bucket' })).rejects.toThrow('SAP redirected the request');
    } finally { globalThis.fetch = original; }
  });
  it('treats it as a redirect error on a write, so a single-row change is never reported as done', async () => {
    const original = globalThis.fetch;
    const { calls, fake } = opaque();
    globalThis.fetch = fake;
    try {
      await expect(sapRequest(settings, conn(), relay, { method: 'PATCH', path: "Alm1Bucket('B01')", body: '{}', etag: 'W/"1"' }))
        .rejects.toMatchObject({ status: 502, message: expect.stringContaining('SAP redirected the request') });
      expect(calls.map(c => c.method)).toEqual(['GET', 'PATCH']);
    } finally { globalThis.fetch = original; }
  });
});
