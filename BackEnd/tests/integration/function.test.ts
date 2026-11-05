import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { HttpRequest } from '@azure/functions';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { resetConfig } from '@core/server/config';
import { functionDbPath, handler } from '../../src/function';
// @ts-expect-error: a plain .mjs build script, no types
import { zipFolder } from '../../scripts/zip.mjs';

const FRONTEND = 'https://app.example.com';
const API = 'https://backend.azurewebsites.net';

/** The entries of a zip file (name → contents), read back with Node's zlib. */
function unzip(file: string): Map<string, Buffer> {
  const buf = readFileSync(file);
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  const out = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(at + 10);
    const size = buf.readUInt32LE(at + 20);
    const nameLen = buf.readUInt16LE(at + 28);
    const name = buf.toString('utf8', at + 46, at + 46 + nameLen);
    const local = buf.readUInt32LE(at + 42);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const body = buf.subarray(start, start + size);
    out.set(name, method === 8 ? inflateRawSync(body) : Buffer.from(body));
    at += 46 + nameLen;
  }
  return out;
}

describe('the BackEnd as an Azure Function (one HTTP function over the same Fastify app)', () => {
  beforeAll(() => {
    vi.stubEnv('DB_PATH', ':memory:');
    vi.stubEnv('APP_ORIGINS', FRONTEND);
    resetConfig();
  });
  afterAll(() => { vi.unstubAllEnvs(); resetConfig(); });

  const call = (method: string, url: string, headers: Record<string, string> = {}, body?: string) =>
    handler(new HttpRequest({ method, url: `${API}${url}`, headers, body: body === undefined ? undefined : { string: body } }));

  it('answers the CORS preflight of the FrontEnd origin, allowing x-app-user and no credentials', async () => {
    const res = await call('OPTIONS', '/api/modules/sample-deals/layouts', { origin: FRONTEND, 'access-control-request-method': 'PUT', 'access-control-request-headers': 'content-type,x-app-request,x-app-user' });
    const headers = res.headers as Headers;
    expect(headers.get('access-control-allow-origin')).toBe(FRONTEND);
    expect(headers.get('access-control-allow-headers')).toContain('x-app-user');
    expect(headers.get('access-control-allow-credentials')).toBeNull();
  });
  it('serves the application data with no session cookie', async () => {
    const res = await call('GET', '/api/modules/sample-deals?x=1', { origin: FRONTEND, 'x-app-user': 'tester' });
    expect(res.status).toBe(200);
    expect((res.headers as Headers).get('set-cookie')).toBeNull();
    expect((res.headers as Headers).get('cache-control')).toBe('no-store');
    expect((await call('GET', '/api/modules/timebuckets')).status).toBe(404);
  });
  it('refuses a write from another origin, and answers unknown paths in the JSON error shape', async () => {
    expect((await call('POST', '/api/modules/sample-deals/deals/query', { origin: 'https://evil.example', 'x-app-request': '1', 'content-type': 'application/json' }, '{}')).status).toBe(403);
    expect((await call('GET', '/api/nothing/here')).status).toBe(404);
  });
  it('keeps the database at DB_PATH, else in the temp folder (the package folder is read-only)', () => {
    expect(functionDbPath({ DB_PATH: '/home/data/app.db' })).toBe(path.resolve('/home/data/app.db'));
    expect(functionDbPath({})).toBe(path.join(os.tmpdir(), 'app.db'));
  });
});

describe('the zip writer', () => {
  it('zips a folder with / in every entry name', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'zip-'));
    mkdirSync(path.join(dir, 'DB', 'schema'), { recursive: true });
    writeFileSync(path.join(dir, 'host.json'), '{"version":"2.0"}');
    writeFileSync(path.join(dir, 'DB', 'schema', '0001_init.sql'), 'CREATE TABLE t (x);\n'.repeat(50));
    const zip = path.join(dir, '..', `${path.basename(dir)}.zip`);
    expect(zipFolder(dir, zip)).toBe(2);
    const entries = unzip(zip);
    expect([...entries.keys()]).toEqual(['DB/schema/0001_init.sql', 'host.json']);
    expect(entries.get('host.json')!.toString()).toBe('{"version":"2.0"}');
    expect(entries.get('DB/schema/0001_init.sql')!.toString()).toBe('CREATE TABLE t (x);\n'.repeat(50));
  });
});
