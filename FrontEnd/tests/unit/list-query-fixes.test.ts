import type { Actor } from '@core/actor';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Row } from '@/lib/grid/types';
import type { ListDef } from '@/lib/list/types';
import { newSapConnection, REJECTED_MESSAGE } from '@core/sap/client';
import type { AppConfig } from '@core/server/config';
import { moduleService } from '@core/server/module-service';
import { SERVER_MODULES } from '@/modules/server-registry';
import type { ObjectModuleDef, ODataContract } from '@/modules/types';
import { installTestPlatform, relayConfig } from '../support/platform';
import { startMockSap, type MockRow, type MockSap } from '../support/mock-sap';
import { MOCK_SAP_SECRET, MOCK_SAP_USER } from '../support/demo';

installTestPlatform();

let n = 0;
// A fresh acting user id per call: the lookup cache is keyed by acting user and module.
const session = (user = MOCK_SAP_USER, password = MOCK_SAP_SECRET): Actor => ({ id: `s${++n}`, username: user, sap: newSapConnection(user, password) });

const typeOptions = (lk: unknown) => ((lk as { types?: { value: string; label: string }[] } | undefined)?.types ?? []);
const LIST: ListDef<unknown> = {
  entity: 'deals', keys: ['deal', 'seq'], columns: [],
  fields: [
    { field: 'deal', label: 'Deal', type: 'code', max: 10 },
    { field: 'seq', label: 'Seq', type: 'integer' },
    { field: 'type', label: 'Type', type: 'select', options: typeOptions },
    { field: 'name', label: 'Name', type: 'text', max: 40 }
  ],
  search: ['deal'], filters: ['type', 'name'], sort: ['name'], defaultSort: { field: 'deal', dir: 1 }, pageSizes: [10, 50]
};
const ROWS: Row[] = Array.from({ length: 25 }, (_, i) => ({ deal: i === 0 ? "O'B" : `D${i}`, seq: String(i + 1), type: '01', name: `N${i}` }));
const sapRow = (r: Row): MockRow => ({ Deal: r.deal, Seq: Number(r.seq), Type: r.type, Name: r.name });
const def: ObjectModuleDef<unknown> = {
  kind: 'object', id: 'test-list-fix', title: 'Fix', noun: ['Deal', 'Deals'], serviceKey: 'samples', storageKey: 'k',
  opens: { create: 'popup', open: 'popup' },
  lookups: raw => ({ types: ((raw as Record<string, Row[]> | undefined)?.types ?? []).map(r => ({ value: r.value, label: r.label })) }),
  list: LIST, header: LIST.fields, tabs: []
};
const contract: ODataContract = {
  service: 'ZFS_SB_TEST_O4_API', naming: 'pascal', numbers: ['seq'], flagType: 'boolean', keyTypes: { seq: 'number' }, tables: { deals: { entitySet: 'Deal' } },
  lookups: { types: { entitySet: 'TypeDomain', fields: { value: 'Value', label: 'Text' } } }
};
const page = { page: 1, pageSize: 10 };

describe('list query fixes', () => {
  let sap: MockSap;
  let cfg: AppConfig;
  const start = async (opts: Parameters<typeof startMockSap>[0] = {}) => {
    sap = await startMockSap({
      sets: { Deal: { key: 'Deal', keys: ['Deal', 'Seq'], rows: ROWS.map(sapRow) }, TypeDomain: { key: 'Value', rows: [{ Value: '01', Text: 'Loan' }, { Value: '02', Text: 'Deposit' }] } },
      ...opts
    });
    cfg = relayConfig(sap);
  };
  beforeAll(() => { SERVER_MODULES['test-list-fix'] = { def, contract, seed: { tables: { deals: ROWS } }, source: 'sap' }; });
  beforeEach(async () => { await start(); });
  afterEach(async () => { await sap.close(); });
  const svc = () => moduleService(cfg, 'test-list-fix');

  it('answers 400 for an invalid filter without any SAP request', async () => {
    await expect(svc().query(session(), 'deals', { ...page, filters: [{ field: 'secret', op: 'eq', values: ['x'] }] })).rejects.toMatchObject({ status: 400 });
    await expect(svc().query(session(), 'deals', { page: 0, pageSize: 10 })).rejects.toMatchObject({ status: 400 });
    expect(sap.log).toHaveLength(0);
  });

  it('checks a select value against lookups, read once for consecutive pages', async () => {
    const s = session();
    const filters = [{ field: 'type', op: 'eq', values: ['01'] }];
    await svc().query(s, 'deals', { ...page, filters });
    await svc().query(s, 'deals', { page: 2, pageSize: 10, filters });
    expect(sap.log.filter(r => r.rel === 'TypeDomain')).toHaveLength(1);
    await expect(svc().query(s, 'deals', { ...page, filters: [{ field: 'type', op: 'eq', values: ['99'] }] })).rejects.toMatchObject({ status: 400 });
    expect(sap.log.filter(r => r.rel === 'Deal')).toHaveLength(2);
  });

  it('turns a SAP 401 into 502 with the rejected-account message', async () => {
    await expect(svc().query(session('NOBODY', 'wrong'), 'deals', page)).rejects.toMatchObject({ status: 502, message: REJECTED_MESSAGE });
  });

  it("turns a SAP 400 into 502 with SAP's message", async () => {
    sap.failNext(400, 'Boom from RAP', 'GET');
    await expect(svc().query(session(), 'deals', page)).rejects.toMatchObject({ status: 502, message: expect.stringContaining('Boom from RAP') });
  });

  it('accepts a string @odata.count and survives a missing one', async () => {
    await sap.close();
    await start({ countStyle: 'string' });
    expect((await svc().query(session(), 'deals', page)).total).toBe(25);
    await sap.close();
    await start({ countStyle: 'none' });
    expect((await svc().query(session(), 'deals', { page: 2, pageSize: 10 })).total).toBe(20);
  });

  it('fills a page from nextLink when SAP serves fewer rows than $top', async () => {
    await sap.close();
    await start({ pageSize: 4 });
    const r = await svc().query(session(), 'deals', page);
    expect(r.rows).toHaveLength(10);
    expect(r.total).toBe(25);
    expect(sap.log.filter(x => x.rel.startsWith('Deal')).length).toBeGreaterThan(1);
  });

  it('reads multi-key rows by key with a quote in a value', async () => {
    const found = await svc().readKeys(session(), 'deals', [{ deal: "O'B", seq: '1' }, { deal: 'D3', seq: '4' }]);
    expect(found.map(r => r.deal)).toEqual(["O'B", 'D3']);
    expect(sap.log.find(r => r.rel === 'Deal')?.query.get('$filter')).toBe("(Deal eq 'O''B' and Seq eq 1) or (Deal eq 'D3' and Seq eq 4)");
  });
});
