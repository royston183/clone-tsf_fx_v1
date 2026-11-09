// The SAP account check skips a service binding that is not published on the system (404) and proves the account on
// the next one; a rejected user or password stops at once (never sent to a second service).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpError } from '@/lib/errors';

const seen = vi.hoisted(() => ({ keys: [] as string[], answer: {} as Record<string, number> }));
vi.mock('@core/sap/client', async orig => ({
  ...(await orig<typeof import('@core/sap/client')>()),
  checkService: vi.fn(async (_s: unknown, _c: unknown, service: { key: string }) => {
    seen.keys.push(service.key);
    const status = seen.answer[service.key] ?? 200;
    if (status !== 200) throw new HttpError(status, `HTTP ${status}`);
    return { service: service.key, connected: true as const, checkedAt: '2026-11-07T00:00:00Z' };
  })
}));

import { buildConfig, checkAnyService } from '@/lib/client/sap-account';
import { newSapConnection } from '@core/sap/client';

const keys = () => Object.values(buildConfig().services).map(s => s.key);
const run = () => checkAnyService({ client: '100', timeoutMs: 1000 }, newSapConnection('USER', 'secret'));

beforeEach(() => { seen.keys = []; seen.answer = {}; });

describe('checkAnyService', () => {
  it('skips a service that is not published (404) and proves the account on the next', async () => {
    const [first, second] = keys();
    seen.answer = { [first]: 404 };
    await expect(run()).resolves.toMatchObject({ service: second, connected: true });
    expect(seen.keys).toEqual([first, second]);
  });
  it('stops at a rejected user or password without trying another service', async () => {
    const [first] = keys();
    seen.answer = { [first]: 401 };
    await expect(run()).rejects.toMatchObject({ status: 401 });
    expect(seen.keys).toEqual([first]);
  });
  it('reports not published when no service is', async () => {
    seen.answer = Object.fromEntries(keys().map(k => [k, 404]));
    await expect(run()).rejects.toMatchObject({ status: 404 });
    expect(seen.keys).toEqual(keys());
  });
});
