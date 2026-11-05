// tests/integration/large-table.test.ts
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { TabDef } from '@/lib/grid/types';
import { newSapConnection } from '@core/sap/client';
import type { AppConfig } from '@core/server/config';
import { moduleService } from '@core/server/module-service';
import { SERVER_MODULES } from '@/modules/server-registry';
import { contract } from '@/modules/time-buckets/contract';
import { timeBuckets, type TimeBucketLookups } from '@/modules/time-buckets/definition';
import seed from '@/modules/time-buckets/seed.json';
import { actingAs, freshConfig, installTestPlatform, relayConfig } from '../support/platform';
import { startMockSap, type MockSap } from '../support/mock-sap';

installTestPlatform();

const alm1 = timeBuckets.tabs[0];
const large: TabDef<TimeBucketLookups> = {
  ...alm1, large: true,
  list: { entity: 'alm1', keys: ['bucket'], columns: alm1.columns, fields: alm1.grid, search: ['bucket', 'description'], sort: ['bucket'], defaultSort: { field: 'bucket', dir: 1 }, pageSizes: [50] }
};

describe('a large table-maintenance tab', () => {
  let sap: MockSap;
  let cfg: AppConfig;
  const user = actingAs(newSapConnection('TESTER', 'secret'));
  beforeAll(() => {
    SERVER_MODULES['test-large'] = { def: { ...timeBuckets, id: 'test-large', tabs: [large, timeBuckets.tabs[1]] }, contract, seed, source: 'sap' };
    SERVER_MODULES['test-large-store'] = { ...SERVER_MODULES['test-large'], source: undefined };
  });
  beforeEach(async () => { sap = await startMockSap(); cfg = relayConfig(sap); });
  afterEach(async () => { await sap.close(); });

  it('is never loaded whole: the view leaves it out and the list is paged by SAP', async () => {
    const svc = moduleService(cfg, 'test-large');
    const view = await svc.view(user);
    expect(view.tables.alm1).toBeUndefined();
    expect(view.tables.alm2).toHaveLength(1);
    expect(sap.log.some(r => r.method === 'GET' && r.rel === 'Alm1Bucket')).toBe(false);
    const page = await svc.query(user, 'alm1', { page: 1, pageSize: 50 });
    expect(page.rows.map(r => r.bucket)).toEqual(['B01', 'B02']);
    expect(page.rows[0].fromFreqText).toBe('Day(s)');
  });

  it('plans an update against only the rows that were sent, by key', async () => {
    const svc = moduleService(cfg, 'test-large');
    const [b01] = (await svc.query(user, 'alm1', { page: 1, pageSize: 50 })).rows;
    sap.log.length = 0;
    const out = await svc.change(user, 'alm1', 'update', [{ ...b01, description: 'Renamed' }]);
    expect(out.result.updated).toBe(1);
    const reads = sap.log.filter(r => r.method === 'GET' && r.rel === 'Alm1Bucket');
    expect(reads.map(r => r.query.get('$filter'))).toEqual(["(Bucket eq 'B01')"]);
    expect(sap.log.find(r => r.method === 'PATCH')?.headers['if-match']).toBe(b01.__etag);
    expect(sap.sets.Alm1Bucket.rows[0].Description).toBe('Renamed');
  });

  it('still refuses a key that exists and a stale ETag', async () => {
    const svc = moduleService(cfg, 'test-large');
    const [b01] = (await svc.query(user, 'alm1', { page: 1, pageSize: 50 })).rows;
    await expect(svc.change(user, 'alm1', 'create', [{ ...b01, __etag: '' }])).rejects.toMatchObject({ status: 422, details: [{ row: 1, field: 'bucket', message: "Bucket 'B01' already exists" }] });
    await svc.change(user, 'alm1', 'update', [{ ...b01, description: 'Theirs' }]);
    await expect(svc.change(user, 'alm1', 'update', [{ ...b01, description: 'Mine' }])).rejects.toMatchObject({ status: 409 });
  });

  it('works the same on the mock store', async () => {
    const local = freshConfig();
    const svc = moduleService(local, 'test-large-store');
    expect((await svc.view(actingAs())).tables.alm1).toBeUndefined();
    const page = await svc.query(actingAs(), 'alm1', { search: 'B0', page: 1, pageSize: 50 });
    expect(page.total).toBe(3);
    const out = await svc.change(actingAs(), 'alm1', 'update', [{ ...page.rows[0], description: 'Local rename' }]);
    expect(out.result.updated).toBe(1);
    expect((await svc.query(actingAs(), 'alm1', { search: 'Local rename', page: 1, pageSize: 50 })).total).toBe(1);
  });
});
