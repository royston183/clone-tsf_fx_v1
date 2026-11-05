import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Row } from '@/lib/grid/types';
import { newSapConnection } from '@core/sap/client';
import type { AppConfig } from '@core/server/config';
import { itemsService } from '@core/server/items-service';
import { CONFLICT_MESSAGE } from '@core/server/odata-backend';
import { seenOf } from '@/lib/items/items';
import { contract } from '@/modules/samples/monthly/contract';
import { monthly } from '@/modules/samples/monthly/definition';
import { monthlySeed } from '@/modules/samples/monthly/seed';
import { SERVER_MODULES } from '@/modules/server-registry';
import { actingAs, freshConfig, installTestPlatform, onSampleData, relayConfig } from '../support/platform';
import { startMockSap, type MockSap, type MockSet } from '../support/mock-sap';

installTestPlatform();

const SEL = { company: '1000', month: '01', year: '2026' };
const sapSets = (): Record<string, MockSet> => ({
  MonthlyAmount: {
    key: 'Company', keys: ['Company', 'Month', 'Year', 'Gl'],
    rows: monthlySeed().tables.amounts.map(r => ({ Company: r.company, Month: r.month, Year: r.year, Gl: r.gl, Amount: Number(r.amount), Currency: r.currency, Remarks: r.remarks }))
  }
});
const seen = (rows: Row[]) => rows.map(r => seenOf(monthly, r));
/** The operations of a $batch body: request line and If-Match (none: undefined). */
const operations = (body: string) => [...body.matchAll(/^(POST|PATCH|DELETE) (\S+) HTTP\/1\.1\r\n((?:[^\r\n]+\r\n)*)/gm)]
  .map(m => ({ line: `${m[1]} ${decodeURIComponent(m[2])}`, ifMatch: /^If-Match: (.*)$/m.exec(m[3])?.[1]?.trim() }));
const editable = (rows: Row[]) => rows.map(r => ({ gl: r.gl, amount: r.amount, currency: r.currency, remarks: r.remarks }));

beforeAll(() => {
  SERVER_MODULES['sample-monthly'] = { def: monthly, contract, seed: monthlySeed, source: 'sap' };
  SERVER_MODULES['test-monthly-small'] = { def: { ...monthly, id: 'test-monthly-small', maxRows: 2 }, contract, seed: monthlySeed, source: 'sap' };
});

describe('header and items on SAP', () => {
  let sap: MockSap;
  let cfg: AppConfig;
  const user = actingAs(newSapConnection('TESTER', 'secret'));
  beforeEach(async () => {
    sap = await startMockSap({ sets: sapSets() });
    cfg = relayConfig(sap);
  });
  afterEach(async () => { await sap.close(); });

  it('reads one selection through the list-query builder', async () => {
    const out = await itemsService(cfg, 'sample-monthly').read(user, SEL);
    expect(out.selection).toEqual(SEL);
    expect(out.rows.map(r => r.gl)).toEqual(['400100', '400200', '500100', '500200', '500300']);
    const get = sap.log.find(r => r.method === 'GET' && r.rel === 'MonthlyAmount');
    expect(get?.query.get('$filter')).toBe("Company eq '1000' and Month eq '01' and Year eq '2026'");
    expect(get?.query.get('$top')).toBe('501');
  });

  it('saves creates, updates and deletes as one $batch changeset', async () => {
    const svc = itemsService(cfg, 'sample-monthly');
    const { rows } = await svc.read(user, SEL);
    const next = editable(rows).filter(r => r.gl !== '500300').map(r => (r.gl === '400100' ? { ...r, amount: '99.00' } : r));
    const out = await svc.save(user, { selection: SEL, seen: seen(rows), rows: [...next, { gl: '600100', amount: '1,000', currency: 'INR', remarks: '' }] });
    expect(out.result).toEqual({ created: 1, updated: 1, deleted: 1, skipped: 3 });
    const batches = sap.log.filter(r => r.rel === '$batch');
    expect(batches).toHaveLength(1);
    expect(batches[0].body).toContain("PATCH MonthlyAmount(Company='1000',Month='01',Year='2026',Gl='400100') HTTP/1.1");
    expect(batches[0].body).toContain('POST MonthlyAmount HTTP/1.1');
    expect(batches[0].body).toContain("DELETE MonthlyAmount(Company='1000',Month='01',Year='2026',Gl='500300') HTTP/1.1");
    expect(out.rows.map(r => r.gl)).toEqual(['400100', '400200', '500100', '500200', '600100']);
  });

  it('refuses duplicate rows with their row number (422) and sends nothing', async () => {
    const svc = itemsService(cfg, 'sample-monthly');
    const stored = (await svc.read(user, SEL)).rows, rows = editable(stored);
    await expect(svc.save(user, { selection: SEL, seen: seen(stored), rows: [...rows, { ...rows[0] }] }))
      .rejects.toMatchObject({ status: 422, details: [{ row: 6, field: 'gl', message: "GL Account '400100' is used twice." }] });
    expect(sap.log.some(r => r.rel === '$batch')).toBe(false);
  });

  it('refuses a save when someone added a row since Show (409) and changes nothing', async () => {
    const svc = itemsService(cfg, 'sample-monthly');
    const mine = (await svc.read(user, SEL)).rows;
    const theirs = (await svc.read(user, SEL)).rows;
    await svc.save(user, { selection: SEL, seen: seen(theirs), rows: [...editable(theirs), { gl: '600100', amount: '5.00', currency: 'INR', remarks: '' }] });
    const before = structuredClone(sap.sets.MonthlyAmount.rows);
    const sent = sap.log.filter(r => r.rel === '$batch').length;
    const next = editable(mine).map(r => (r.gl === '400100' ? { ...r, amount: '77.00' } : r));
    await expect(svc.save(user, { selection: SEL, seen: seen(mine), rows: next })).rejects.toMatchObject({ status: 409, message: CONFLICT_MESSAGE });
    expect(sap.log.filter(r => r.rel === '$batch')).toHaveLength(sent);
    expect(sap.sets.MonthlyAmount.rows).toEqual(before);
  });

  it('refuses a save when someone changed a row since Show (409), even one this save leaves alone', async () => {
    const svc = itemsService(cfg, 'sample-monthly');
    const mine = (await svc.read(user, SEL)).rows;
    const theirs = (await svc.read(user, SEL)).rows;
    await svc.save(user, { selection: SEL, seen: seen(theirs), rows: editable(theirs).map(r => (r.gl === '400200' ? { ...r, amount: '2.00' } : r)) });
    const before = structuredClone(sap.sets.MonthlyAmount.rows);
    await expect(svc.save(user, { selection: SEL, seen: seen(mine), rows: editable(mine).map(r => (r.gl === '400100' ? { ...r, amount: '77.00' } : r)) }))
      .rejects.toMatchObject({ status: 409, message: CONFLICT_MESSAGE });
    expect(sap.sets.MonthlyAmount.rows).toEqual(before);
  });

  it('sends the seen ETag as If-Match on updates and deletes', async () => {
    const svc = itemsService(cfg, 'sample-monthly');
    const { rows } = await svc.read(user, SEL);
    const etag = (gl: string) => rows.find(r => r.gl === gl)?.__etag;
    expect(etag('400100')).toMatch(/^W\//);
    await svc.save(user, { selection: SEL, seen: seen(rows), rows: editable(rows).filter(r => r.gl !== '500300').map(r => (r.gl === '400100' ? { ...r, amount: '99.00' } : r)) });
    expect(operations(sap.log.filter(r => r.rel === '$batch')[0].body)).toEqual(expect.arrayContaining([
      { line: "PATCH MonthlyAmount(Company='1000',Month='01',Year='2026',Gl='400100')", ifMatch: etag('400100') },
      { line: "DELETE MonthlyAmount(Company='1000',Month='01',Year='2026',Gl='500300')", ifMatch: etag('500300') }
    ]));
  });

  it('refuses a save without the rows it saw (400), and rows that are not objects (400)', async () => {
    const svc = itemsService(cfg, 'sample-monthly');
    const { rows } = await svc.read(user, SEL);
    await expect(svc.save(user, { selection: SEL, rows: editable(rows) })).rejects.toMatchObject({ status: 400, message: 'Refresh and try again.' });
    await expect(svc.save(user, { selection: SEL, seen: seen(rows), rows: [null] })).rejects.toMatchObject({ status: 400 });
    expect(sap.log.some(r => r.rel === '$batch')).toBe(false);
  });

  it('asks for a narrower selection above maxRows and refuses an invalid selection', async () => {
    await expect(itemsService(cfg, 'test-monthly-small').read(user, SEL)).rejects.toMatchObject({ status: 400, message: 'More than 2 rows match this selection. Narrow your selection.' });
    await expect(itemsService(cfg, 'sample-monthly').read(user, { ...SEL, company: '' })).rejects.toMatchObject({ status: 400, message: 'Company Code is required' });
  });
});

describe('header and items on the mock store', () => {
  onSampleData('sample-monthly', 'test-monthly-small');
  it('saves and reads back the selection', async () => {
    const cfg = freshConfig();
    const svc = itemsService(cfg, 'sample-monthly');
    const stored = (await svc.read(actingAs(), SEL)).rows, rows = editable(stored);
    const out = await svc.save(actingAs(), { selection: SEL, seen: seen(stored), rows: rows.map(r => (r.gl === '400200' ? { ...r, amount: '1.50' } : r)) });
    expect(out.result.updated).toBe(1);
    expect((await svc.read(actingAs(), SEL)).rows.find(r => r.gl === '400200')?.amount).toBe('1.50');
    expect((await svc.read(actingAs(), { ...SEL, month: '02' })).rows).toHaveLength(5);
  });
  it('refuses stale saves on the mock store too (409): a row added, a row changed', async () => {
    const cfg = freshConfig();
    const svc = itemsService(cfg, 'sample-monthly');
    const edit = (rows: Row[]) => editable(rows).map(r => (r.gl === '400100' ? { ...r, amount: '77.00' } : r));
    const mine = (await svc.read(actingAs(), SEL)).rows;
    let theirs = (await svc.read(actingAs(), SEL)).rows;
    await svc.save(actingAs(), { selection: SEL, seen: seen(theirs), rows: [...editable(theirs), { gl: '600100', amount: '5.00', currency: 'INR', remarks: '' }] });
    await expect(svc.save(actingAs(), { selection: SEL, seen: seen(mine), rows: edit(mine) })).rejects.toMatchObject({ status: 409, message: CONFLICT_MESSAGE });
    const again = (await svc.read(actingAs(), SEL)).rows;
    theirs = (await svc.read(actingAs(), SEL)).rows;
    expect(theirs.map(r => r.gl)).toContain('600100');
    await svc.save(actingAs(), { selection: SEL, seen: seen(theirs), rows: editable(theirs).map(r => (r.gl === '400200' ? { ...r, amount: '2.00' } : r)) });
    await expect(svc.save(actingAs(), { selection: SEL, seen: seen(again), rows: edit(again) })).rejects.toMatchObject({ status: 409, message: CONFLICT_MESSAGE });
    const now = (await svc.read(actingAs(), SEL)).rows;
    expect(now.find(r => r.gl === '400100')?.amount).not.toBe('77.00');
    expect(now.find(r => r.gl === '400200')?.amount).toBe('2.00');
    expect(now.map(r => r.gl)).toContain('600100');
  });
});
