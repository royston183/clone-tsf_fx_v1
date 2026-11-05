import { describe, expect, it } from 'vitest';
import { actingUserOf, actorOf, assertTrustedWrite, errorResponse, handle, readJson } from '@core/server/http';
import { HttpError } from '@/lib/errors';
import { testConfig } from '../support/config';

const cfg = testConfig();
const req = (headers: Record<string, string>, body?: string) => new Request('http://localhost:3100/api/x', { method: 'POST', headers, body });

describe('assertTrustedWrite', () => {
  it('accepts the same origin or a listed origin with the app header', () => {
    expect(() => assertTrustedWrite(req({ origin: 'http://localhost:3100', 'x-app-request': '1' }), cfg)).not.toThrow();
    expect(() => assertTrustedWrite(new Request('http://127.0.0.1:3100/api/x', { method: 'POST', headers: { origin: 'http://127.0.0.1:3100', 'x-app-request': '1' } }), cfg)).not.toThrow();
  });
  it('rejects a foreign origin, a missing origin or a missing header', () => {
    expect(() => assertTrustedWrite(req({ origin: 'http://evil.example', 'x-app-request': '1' }), cfg)).toThrow('Untrusted request origin.');
    expect(() => assertTrustedWrite(req({ 'x-app-request': '1' }), cfg)).toThrow(HttpError);
    expect(() => assertTrustedWrite(req({ origin: 'http://localhost:3100' }), cfg)).toThrow(HttpError);
  });
});

describe('actorOf', () => {
  const withUser = (user?: string) => new Request('http://127.0.0.1:3200/api/x', { headers: user === undefined ? {} : { 'x-app-user': user } });
  it('acts as the x-app-user, upper case, with no SAP connection', () => {
    expect(actorOf(withUser('karthik'))).toEqual({ id: 'KARTHIK', username: 'KARTHIK', sap: null });
    expect(actorOf(withUser('a.b_c-1')).username).toBe('A.B_C-1');
    expect(actorOf(withUser('x'.repeat(12))).username).toBe('X'.repeat(12));
  });
  it('acts as DEMO without a header, or for an empty, long or odd name', () => {
    expect(actorOf(withUser())).toEqual({ id: 'DEMO', username: 'DEMO', sap: null });
    for (const user of ['', '   ', 'a'.repeat(13), 'a'.repeat(40), 'a:b', 'a b', 'é', '<x>']) expect(actorOf(withUser(user)).username, JSON.stringify(user)).toBe('DEMO');
    // A header value cannot hold a line break (Headers refuses it); the check still refuses one.
    for (const user of ['a\nb', 'a\rb', 'a\tb', null]) expect(actingUserOf(user), JSON.stringify(user)).toBe('DEMO');
  });
});

describe('readJson', () => {
  it('parses a JSON object', async () => {
    expect(await readJson(req({ 'content-type': 'application/json' }, '{"a":1}'))).toEqual({ a: 1 });
    expect(await readJson(req({ 'content-type': 'application/json' }))).toEqual({});
  });
  it('rejects other content types, bad JSON, arrays and large bodies', async () => {
    await expect(readJson(req({ 'content-type': 'text/plain' }, '{}'))).rejects.toMatchObject({ status: 415 });
    await expect(readJson(req({ 'content-type': 'application/json' }, '{bad'))).rejects.toMatchObject({ status: 400 });
    await expect(readJson(req({ 'content-type': 'application/json' }, '[1]'))).rejects.toMatchObject({ status: 400 });
    await expect(readJson(req({ 'content-type': 'application/json' }, `"${'x'.repeat(20)}"`), 10)).rejects.toMatchObject({ status: 413 });
  });
});

describe('errors', () => {
  it('maps HttpError to its status and JSON shape', async () => {
    const r = errorResponse(new HttpError(422, 'Some rows need attention.', [{ row: 1, field: 'bucket', message: 'x' }]));
    expect(r.status).toBe(422);
    expect(await r.json()).toEqual({ error: { message: 'Some rows need attention.', details: [{ row: 1, field: 'bucket', message: 'x' }] } });
  });
  it('hides unexpected errors behind a 500', async () => {
    const r = await handle(async () => { throw new Error('secret detail'); });
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toContain('secret detail');
  });
});
