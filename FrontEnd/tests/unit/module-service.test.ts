// The table-module service in the page: on sample data in memory, and over SAP through the relay (the mock SAP).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Actor } from '@core/actor';
import { newSapConnection } from '@core/sap/client';
import { loadConfig } from '@core/server/config';
import { itemsService } from '@core/server/items-service';
import { moduleService, resetModuleBackends } from '@core/server/module-service';
import { NO_SAP_ACCOUNT } from '@core/server/odata-backend';
import type { Row } from '@/lib/grid/types';
import { seenOf } from '@/lib/items/items';
import { monthly } from '@/modules/samples/monthly/definition';
import { SERVER_MODULES } from '@/modules/server-registry';
import { startMockSap, type MockSap } from '../support/mock-sap';
import { installTestPlatform, setMockRelay } from '../support/platform';

const cfg = loadConfig({});
const demo: Actor = { id: 'demo', username: 'demo', sap: null };
const newRow = { bucket: 'B09', description: 'New bucket', xbrlCode: 'X9', fromNo: '1', fromFreq: '02', toNo: '2', toFreq: '02', rbiNo: '9', fromDays: '', toDays: '' };
const timebuckets = SERVER_MODULES.timebuckets;

beforeEach(() => { installTestPlatform(); });

describe('a table module on its sample data (no source yet)', () => {
  beforeAll(() => { SERVER_MODULES.timebuckets = { ...timebuckets, source: undefined }; });
  afterAll(() => { SERVER_MODULES.timebuckets = timebuckets; });

  it('serves the seed enriched with frequency texts', async () => {
    const view = await moduleService(cfg, 'timebuckets').view(demo);
    expect(view).toMatchObject({ mode: 'local', service: null });
    expect(view.tables.alm1.map(r => r.bucket)).toEqual(['B01', 'B02', 'B03']);
    expect(view.tables.alm1[0].fromFreqText).toBe('Day(s)');
  });
  it('adds, updates and deletes with stamps', async () => {
    const svc = moduleService(cfg, 'timebuckets');
    const added = await svc.change(demo, 'alm1', 'create', [newRow]);
    expect(added.result).toEqual({ created: 1, updated: 0, deleted: 0, skipped: 0 });
    expect(added.tables.alm1.find(r => r.bucket === 'B09')).toMatchObject({ enteredBy: 'DEMO', changedBy: '' });
    const updated = await svc.change(demo, 'alm1', 'update', [{ ...newRow, description: 'Renamed' }]);
    expect(updated.result.updated).toBe(1);
    expect(updated.tables.alm1.find(r => r.bucket === 'B09')).toMatchObject({ description: 'Renamed', changedBy: 'DEMO' });
    expect((await svc.view(demo)).tables.alm1.some(r => r.bucket === 'B09')).toBe(true);
    expect((await svc.change(demo, 'alm1', 'delete', [{ bucket: 'B09' }])).result.deleted).toBe(1);
  });
  it('rejects invalid rows with per-row details and saves nothing', async () => {
    const svc = moduleService(cfg, 'timebuckets');
    await expect(svc.change(demo, 'alm1', 'create', [{ ...newRow, description: '' }]))
      .rejects.toMatchObject({ status: 422, details: [{ row: 1, field: 'description', message: 'Description is required' }] });
    expect((await svc.view(demo)).tables.alm1).toHaveLength(3);
  });
  it('rejects an over-length integer by its field type', async () => {
    const svc = moduleService(cfg, 'timebuckets');
    await expect(svc.change(demo, 'alm1', 'create', [{ ...newRow, fromNo: '123456' }]))
      .rejects.toMatchObject({ status: 422, details: [{ row: 1, field: 'fromNo', message: 'From No allows at most 5 digits.' }] });
  });
  it('rejects an unknown application or table', async () => {
    expect(() => moduleService(cfg, 'nope')).toThrow('Unknown application.');
    await expect(moduleService(cfg, 'timebuckets').change(demo, 'zzz', 'create', [newRow])).rejects.toMatchObject({ status: 404 });
  });
});

describe('SAP OData backend', () => {
  let sap: MockSap;
  let user: Actor;
  beforeEach(async () => {
    sap = await startMockSap();
    setMockRelay(sap);
    user = { id: 'tester', username: 'TESTER', sap: newSapConnection('TESTER', 'secret') };
  });
  afterEach(async () => { await sap.close(); });

  it('maps PascalCase properties and keeps ETags', async () => {
    const view = await moduleService(cfg, 'timebuckets').view(user);
    expect(view).toMatchObject({ mode: 'odata', service: 'ZFS_SB_ALMTIMEBKT_O4_API' });
    expect(view.tables.alm1[0]).toMatchObject({ bucket: 'B01', description: 'Day 1', xbrlCode: 'X-B01', enteredBy: 'SAMPLE', enteredOn: '20260915', fromFreqText: 'Day(s)' });
    expect(view.tables.alm1[0].__etag).toMatch(/^W\/"\d+"$/);
    expect(view.lookups.freqDomain).toHaveLength(4);
  });
  it('sends several rows as one $batch changeset', async () => {
    const out = await moduleService(cfg, 'timebuckets').change(user, 'alm1', 'create', [newRow, { ...newRow, bucket: 'B10' }]);
    expect(out.result.created).toBe(2);
    const batches = sap.log.filter(r => r.rel === '$batch');
    expect(batches).toHaveLength(1);
    expect(batches[0].headers['content-type']).toMatch(/^multipart\/mixed; boundary=batch_/);
    expect(sap.sets.Alm1Bucket.rows.map(r => r.Bucket)).toEqual(['B01', 'B02', 'B09', 'B10']);
    expect(sap.sets.Alm1Bucket.rows[2]).toMatchObject({ FromFreq: '02', RbiNo: '9', Description: 'New bucket' });
  });
  it('saves nothing when SAP rejects one row of the batch', async () => {
    await expect(moduleService(cfg, 'timebuckets').change(user, 'alm1', 'create', [newRow, { ...newRow, bucket: 'B10', description: 'SAP-REJECT' }]))
      .rejects.toThrow('Rejected by RAP validation');
    expect(sap.sets.Alm1Bucket.rows.map(r => r.Bucket)).toEqual(['B01', 'B02']);
  });
  it('updates one row with its ETag as If-Match', async () => {
    const svc = moduleService(cfg, 'timebuckets');
    const b01 = (await svc.view(user)).tables.alm1[0];
    const out = await svc.change(user, 'alm1', 'update', [{ ...b01, description: 'Changed' }]);
    expect(out.result.updated).toBe(1);
    const patch = sap.log.find(r => r.method === 'PATCH');
    expect(patch?.rel).toBe("Alm1Bucket(Bucket='B01')");
    expect(patch?.headers['if-match']).toBe(b01.__etag);
    expect(JSON.parse(patch?.body ?? '{}')).not.toHaveProperty('Bucket');
    expect(sap.sets.Alm1Bucket.rows[0].Description).toBe('Changed');
  });
  it('turns a stale ETag into a conflict and keeps the row', async () => {
    const svc = moduleService(cfg, 'timebuckets');
    const b01 = (await svc.view(user)).tables.alm1[0];
    sap.failNext(412, 'The entry was changed by another user', 'PATCH');
    await expect(svc.change(user, 'alm1', 'update', [{ ...b01, description: 'Mine' }]))
      .rejects.toMatchObject({ status: 409, message: 'This entry was changed by someone else. Refresh and try again.' });
    expect(sap.sets.Alm1Bucket.rows[0].Description).toBe('Day 1');
  });
  it('refuses to overwrite a change someone saved after the edit grid was opened', async () => {
    const svc = moduleService(cfg, 'timebuckets');
    const opened = (await svc.view(user)).tables.alm1[0];
    // Someone else saves the same bucket first.
    await svc.change(user, 'alm1', 'update', [{ ...opened, description: 'Theirs' }]);
    await expect(svc.change(user, 'alm1', 'update', [{ ...opened, description: 'Mine' }]))
      .rejects.toMatchObject({ status: 409, message: 'This entry was changed by someone else. Refresh and try again.' });
    expect(sap.sets.Alm1Bucket.rows[0].Description).toBe('Theirs');
  });
  it('refuses to delete a row someone changed after it was shown', async () => {
    const svc = moduleService(cfg, 'timebuckets');
    const shown = (await svc.view(user)).tables.alm1[1];
    await svc.change(user, 'alm1', 'update', [{ ...shown, description: 'Theirs' }]);
    await expect(svc.change(user, 'alm1', 'delete', [{ bucket: shown.bucket, __etag: shown.__etag }])).rejects.toMatchObject({ status: 409 });
    expect(sap.sets.Alm1Bucket.rows.map(r => r.Bucket)).toEqual(['B01', 'B02']);
  });
  it('deletes with If-Match', async () => {
    await moduleService(cfg, 'timebuckets').change(user, 'alm1', 'delete', [{ bucket: 'B02' }]);
    expect(sap.log.find(r => r.method === 'DELETE')?.headers['if-match']).toMatch(/^W\//);
    expect(sap.sets.Alm1Bucket.rows.map(r => r.Bucket)).toEqual(['B01']);
  });
  it('refuses to call SAP without an SAP account, and sends nothing', async () => {
    await expect(moduleService(cfg, 'timebuckets').view(demo)).rejects.toMatchObject({ status: 502, message: NO_SAP_ACCOUNT });
    await expect(moduleService(cfg, 'timebuckets').change(demo, 'alm1', 'create', [newRow])).rejects.toMatchObject({ status: 502, message: NO_SAP_ACCOUNT });
    expect(sap.log).toEqual([]);
  });
});

describe('a module on sample data keeps its edits in memory only', () => {
  const actor: Actor = { id: 'tester', username: 'TESTER', sap: null };
  const SEL = { company: '1000', month: '01', year: '2026' };
  const amountOf = (rows: Row[], gl: string) => rows.find(r => r.gl === gl)?.amount;

  it('a reset brings back the sample data', async () => {
    const save = async (gl: string, amount: string) => {
      const svc = itemsService(cfg, 'sample-monthly');
      const rows = (await svc.read(actor, SEL)).rows;
      const edited = rows.map(r => ({ gl: r.gl, amount: r.gl === gl ? amount : r.amount, currency: r.currency, remarks: r.remarks }));
      await svc.save(actor, { selection: SEL, seen: rows.map(r => seenOf(monthly, r)), rows: edited });
    };
    const before = (await itemsService(cfg, 'sample-monthly').read(actor, SEL)).rows;
    await save('400100', '11.00');
    await save('400200', '22.00');
    const edited = (await itemsService(cfg, 'sample-monthly').read(actor, SEL)).rows;
    expect([amountOf(edited, '400100'), amountOf(edited, '400200')]).toEqual(['11.00', '22.00']);
    resetModuleBackends();
    const after = (await itemsService(cfg, 'sample-monthly').read(actor, SEL)).rows;
    expect([amountOf(after, '400100'), amountOf(after, '400200')]).toEqual([amountOf(before, '400100'), amountOf(before, '400200')]);
  });
});
