// MO: Execute Settlement for Deal ID: what the screen reads and what its writes send to the data client (no network: the client is replaced).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Row } from '@/lib/grid/types';

const client = vi.hoisted(() => ({
  moduleQuery: vi.fn(), moduleView: vi.fn(), reportRun: vi.fn(), moduleChange: vi.fn(), objectWrite: vi.fn()
}));
vi.mock('@/lib/client/data', () => client);

import { livePorts } from '@/pages/execute-settlement/actions';
import type { Deal } from '@/pages/execute-settlement/data';
import { loadDeal, loadDealList } from '@/pages/execute-settlement/live';

type Query = { filters?: { field: string; values: string[] }[]; search?: string };
/** Tables of the middleware by module / table; a query answers the rows its first filter selects. */
const DATA: Record<string, Row[]> = {
  'tsf-deal-id/dealIds': [{ dealId: '7000000056', dealType: 'FX', subType: 'FX1', status: '20', model: 'M032', mcRef: '2000000046', traderCode: 'C', startDate: '2026-09-30', endDate: '2026-10-30', revisedEndDate: '', dealDesc: 'D', __etag: 'W/"e1"' }],
  'master-contract/contracts': [{ mcNo: '2000000046', mcRef: 'RICE', mcDate: '2026-10-01', shipEnd: '2027-02-28', model: 'M032' }, { mcNo: '2000000047', mcRef: 'x' }],
  'settlement-data/models': [{ coArea: 'OL10', modId: 'M032', linkModel: '', modDesc: 'INR Long Forward', noInv: '', subType: 'FX1', entDesc: 'OGA-DMCC-OSIPL', currDesc: 'USD-USD-INR', d1InvLink: '02', d1InvLink2: '01', d2InvLink: '03', d1PutCall: '0' }],
  'settlement-data/setTyp': [{ modId: 'M032', tType: 'T1-S', seq: '1', curr: 'USD', setCurr: 'USD', bukrs: 'AE13', sell: 'OGA', buy: 'DMCC', setDesc: 'x', fiType: '01' }],
  'settlement-data/positions': [{ dealId: '7000000056', seq: '1', tType: 'T1-S', exeCo: 'X', __etag: 'W/"p1"' }],
  'settlement-data/postingTypes': [{ fiType: '01', docType: 'TR' }]
};
const answer = (id: string, table: string, q: Query) => {
  if (id === 'settlement-data' && table === 'billAdj' && q.filters?.[0]?.values[0] === 'BOOM') throw new Error('x');
  const rows = DATA[`${id}/${table}`] ?? [];
  return { rows, total: rows.length, page: 1, pageSize: 500 };
};

beforeEach(() => {
  for (const f of Object.values(client)) f.mockReset();
  client.moduleQuery.mockImplementation(async (id: string, table: string, q: Query) => {
    if (id === 'trm-fx-app') throw new Error('TrmFxApp is down');
    return answer(id, table, q);
  });
  client.moduleView.mockResolvedValue({ lookups: { statuses: [{ dealType: 'FX', subType: 'FX1', status: '20', text: 'Settlement Initiated' }, { dealType: 'XX', subType: 'XX1', status: '20', text: 'Other' }], traders: [{ code: 'C', name: 'Nidhi Singh', trader: 'Nidhi S' }] } });
  client.reportRun.mockResolvedValue({ rows: [{ companyCode: 'AE13', rfha: '3000000000033', dealType: 'D1', txnStatus: '16', statusText: 'Released', partner: 'DBS', tradeDate: '2026-10-30', valueDate: '2026-11-16', bs1: 'Sell', curr1: 'USD', amount1: '1000', bs2: 'Buy', curr2: 'INR', amount2: '83000', spotRate: '83', allInRate: '83.1', mcRef: '2000000046', reversed: 'false' }] });
});

describe('reading a Deal ID', () => {
  it('reads the Deal ID record, master contract, model, trader, legs and stored positions through the data client', async () => {
    const d = await loadDeal('7000000056');
    expect(d).toMatchObject({ id: '7000000056', status: '20', etag: 'W/"e1"', mc: '2000000046', mcDesc: 'RICE', mcDate: '2026-10-01', shipEnd: '2027-02-28', model: 'M032', modelText: 'INR Long Forward', entity: 'OGA - DMCC - OSIPL', currencies: 'USD - USD - INR', noInvoice: false, trader: 'Nidhi S' });
    expect(d.statuses).toEqual([{ code: '20', text: 'Settlement Initiated' }]);
    expect(d.fx.map(l => l.txn)).toEqual(['3000000000033']);
    expect(d.inv).toHaveLength(1);
    expect(d.inv[0]).toMatchObject({ leg: 'T1-S', settled: true, docType: 'TR' });
    // the report reads the Deal ID over the whole blotter range
    expect(client.reportRun).toHaveBeenCalledWith('tsf-deals', { selection: { dealId: '7000000056', blotterDate: '2000-01-01', blotterTo: '2099-12-31' } });
    // the Deal ID's record is kept whole for the status update (without its ETag)
    expect(d.record).toMatchObject({ dealId: '7000000056', status: '20' });
    expect(d.record).not.toHaveProperty('__etag');
    // the model's configuration is read by model, the Deal ID's by Deal ID
    const filters = client.moduleQuery.mock.calls.filter(c => c[0] === 'settlement-data').map(c => `${c[1]}:${(c[2] as Query).filters?.map(f => `${f.field}=${f.values[0]}`).join(',') ?? ''}`);
    expect(filters).toEqual(expect.arrayContaining(['setTyp:modId=M032', 'billAdj:dealId=7000000056', 'positions:dealId=7000000056', 'inSpot:dealId=7000000056', 'models:modId=M032']));
  });

  it('says what could not be read (never an empty grid without a reason), and refuses a Deal ID that does not exist', async () => {
    const d = await loadDeal('7000000056');
    expect(d.notes).toEqual([expect.stringContaining('TrmFxApp) could not be read: TrmFxApp is down')]);
    DATA['tsf-deal-id/dealIds'] = [];
    await expect(loadDeal('7')).rejects.toThrow('Deal ID 7 does not exist in ZSGTSFTR_DEALID.');
  });

  it('lists the Deal IDs with their model text and entity string', async () => {
    DATA['tsf-deal-id/dealIds'] = [{ dealId: '7000000056', status: '20', model: 'M032', mcRef: '1', endDate: '2026-10-30', dealDesc: 'D' }, { dealId: '7000000057', status: '04', model: 'M999', mcRef: '', endDate: '', dealDesc: '' }];
    const list = await loadDealList();
    expect(list.map(x => x.id)).toEqual(['7000000057', '7000000056']);
    expect(list[1]).toMatchObject({ modelText: 'INR Long Forward', entity: 'OGA - DMCC - OSIPL' });
    expect(list[0]).toMatchObject({ modelText: '', entity: '' });
  });
});

describe('what the writes send', () => {
  const deal = { id: '7000000056', dealType: 'FX', subType: 'FX1', etag: 'W/"e1"', record: { dealId: '7000000056', dealType: 'FX', subType: 'FX1', status: '10', endDate: '2026-10-30' } } as unknown as Deal;

  it('creates a TRD_POS row that is not stored and updates the one that is, with the ETag it read', async () => {
    client.moduleQuery.mockResolvedValue({ rows: [{ dealId: '7000000056', seq: '1', tType: 'T1-S', exeCo: '', __etag: 'W/"p1"' }], total: 1, page: 1, pageSize: 500 });
    client.moduleChange.mockResolvedValue({});
    await livePorts.writePositions('7000000056', [{ dealId: '7000000056', seq: '1', tType: 'T1-S', exeCo: 'X' }, { dealId: '7000000056', seq: '2', tType: 'T1-P' }]);
    expect(client.moduleChange.mock.calls).toEqual([
      ['settlement-data', 'positions', 'create', [{ dealId: '7000000056', seq: '2', tType: 'T1-P' }]],
      ['settlement-data', 'positions', 'update', [{ dealId: '7000000056', seq: '1', tType: 'T1-S', exeCo: 'X', __etag: 'W/"p1"' }]]
    ]);
  });

  it('changes the Deal ID through the tsf-deal-id object update: its stored record whole, with the change and the ETag read', async () => {
    client.objectWrite.mockResolvedValue({});
    await livePorts.updateDeal(deal, { status: '20' });
    expect(client.objectWrite).toHaveBeenCalledWith('tsf-deal-id', 'update', {
      key: { dealId: '7000000056', dealType: 'FX', subType: 'FX1' }, etag: 'W/"e1"', header: { dealId: '7000000056', dealType: 'FX', subType: 'FX1', status: '20', endDate: '2026-10-30' }
    });
  });

  it('writes IN_SPOT rows by their key: new ones created, stored ones updated', async () => {
    client.moduleChange.mockResolvedValue({});
    const stored: Row = { modId: 'M032', dealId: 'D', dealType: 'D1', dssType: 'DSS1', spotTxn: '555', __etag: 'W/"s1"' };
    await livePorts.writeInSpot(
      [{ modId: 'M032', dealId: 'D', dealType: 'D1', dssType: 'DSS1', fAmt: '1.00' }, { modId: 'M032', dealId: 'D', dealType: 'D1', dssType: '', fAmt: '2.00' }] as never,
      [stored]
    );
    expect(client.moduleChange.mock.calls).toEqual([
      ['settlement-data', 'inSpot', 'create', [{ modId: 'M032', dealId: 'D', dealType: 'D1', dssType: '', fAmt: '2.00' }]],
      ['settlement-data', 'inSpot', 'update', [{ ...stored, fAmt: '1.00' }]]
    ]);
  });
});
