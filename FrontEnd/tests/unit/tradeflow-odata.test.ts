// Master Data and Trade Flows against ZFS_SB_TRADEFLOW_O4_API as the browser sees it through the relay (mock SAP).
import type { Actor } from '@core/actor';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newSapConnection } from '@core/sap/client';
import type { AppConfig } from '@core/server/config';
import { backendFor } from '@core/server/module-service';
import { objectService } from '@core/server/object-service';
import { uploadService } from '@core/server/upload-service';
import { SERVER_MODULES } from '@/modules/server-registry';
import { tradeflowSeed } from '@/modules/tradeflow/seed';
import { actingAs, installTestPlatform, relayConfig } from '../support/platform';
import { startMockSap, type MockSap, type MockSet } from '../support/mock-sap';
import servicesJson from '@/config/services.json';

installTestPlatform();

const IDS = ['commodity', 'commodity-price', 'tradeflow', 'tradeflow-upload'];
const pascal = (f: string) => f.charAt(0).toUpperCase() + f.slice(1);
const NUMBERS = new Set(['quantity', 'price', 'value']);
const toSap = (row: Record<string, string>) => Object.fromEntries(Object.entries(row).map(([f, v]) => [pascal(f), NUMBERS.has(f) ? (v === '' ? null : Number(v)) : v]));

function sets(): Record<string, MockSet> {
  const { tables } = tradeflowSeed();
  let tf = 3000000010;
  return {
    Commodity: { key: 'Commodity', rows: [{ Commodity: 'ALMOND', Description: 'Almonds', Unit: 'LBS', Currency: 'USD', TsfCommodity: 'C001' }] },
    TsfCommodity: { key: 'Commodity', rows: [{ Commodity: 'C001', Description: 'Multiple Commodities' }] },
    CommodityPrice: { key: 'Commodity', keys: ['Commodity', 'EffectiveFrom'], rows: [{ Commodity: 'ALMOND', EffectiveFrom: '2026-11-01', Price: 2.15, Currency: 'USD' }] },
    TradeFlow: {
      key: 'TfNo', keys: ['TfNo', 'TfDate'], rows: tables.tradeflows.map(toSap),
      nav: { _BillOfLading: { set: 'BillOfLading', link: { TfNo: 'TfNo', TfDate: 'TfDate' } } },
      autoKey: () => String(++tf)
    },
    BillOfLading: { key: 'BlNo', keys: ['BlNo', 'BlRecordDate'], rows: tables.bl.map(toSap), etagFromParent: true }
  };
}
/** What SAP received to create rows of this entity set: a direct POST, or the POST parts of a $batch changeset. */
const created = (sap: MockSap, set: string) => sap.log
  .filter(r => r.method === 'POST' && (r.rel === set || (r.rel === '$batch' && r.body.includes(`POST ${set} HTTP/1.1`))))
  .map(r => r.body);

describe('trade flows on SAP (ZFS_SB_TRADEFLOW_O4_API)', () => {
  let sap: MockSap;
  let cfg: AppConfig;
  let user: Actor;
  const saved: Record<string, (typeof SERVER_MODULES)[string]> = {};
  beforeAll(() => {
    for (const id of IDS) { saved[id] = SERVER_MODULES[id]; SERVER_MODULES[id] = { ...SERVER_MODULES[id], source: 'sap' }; }
  });
  beforeEach(async () => {
    user = actingAs(newSapConnection('TESTER', 'secret'));
    sap = await startMockSap({ sets: sets() });
    cfg = relayConfig(sap);
  });
  afterEach(async () => { await sap.close(); });

  it('lists the service under the key every module uses', () => {
    expect(servicesJson.find(s => s.key === 'tradeflow')).toEqual({
      key: 'tradeflow', title: 'Trade Flows', binding: 'ZFS_SB_TRADEFLOW_O4_API',
      path: '/sap/opu/odata4/sap/zfs_sb_tradeflow_o4_api/srvd_a2x/sap/zfs_sd_tradeflow/0001/'
    });
    for (const id of IDS) expect(SERVER_MODULES[id].def.serviceKey).toBe('tradeflow');
  });

  it('reads the commodity master from Commodity', async () => {
    const { tables } = await backendFor('commodity', SERVER_MODULES.commodity).load(user);
    expect(tables.commodities[0]).toMatchObject({ commodity: 'ALMOND', description: 'Almonds', unit: 'LBS', currency: 'USD' });
  });

  it('adds a price with Price as a JSON number', async () => {
    const backend = backendFor('commodity-price', SERVER_MODULES['commodity-price']);
    await backend.apply(user, 'prices', [{ op: 'create', id: 'ALMOND / 2026-11-05', key: { commodity: 'ALMOND', effectiveFrom: '2026-11-05' }, data: { commodity: 'ALMOND', effectiveFrom: '2026-11-05', price: '2.2000' } }]);
    const [body] = created(sap, 'CommodityPrice');
    expect(body).toMatch(/"Price":2\.2[,}]/);
  });

  it('posts an upload as TradeFlow creates without TfNo or TfDate, after one look-up of the BL Numbers', async () => {
    const row = { notifyParty: 'Olam', blNumber: 'NEW0001', blDate: '2023-02-07', etd: '2023-02-07', eta: '2023-03-07', contractRef: '1490004320', contractDate: '', invoiceRef: '9230140002', invoiceDate: '2026-02-08', commodity: 'ALMOND', goods: 'ALMOND STD5', quantity: '44000', unit: 'LBS' };
    expect(await uploadService(cfg, 'tradeflow-upload').post(user, { rows: [row] })).toEqual({ created: 1, updated: 0, invalid: 0 });
    const lookups = sap.log.filter(r => r.method === 'GET' && r.rel === 'TradeFlow');
    expect(lookups.some(r => (r.query.get('$filter') ?? '').includes("BlNumber eq 'NEW0001'"))).toBe(true);
    const [body] = created(sap, 'TradeFlow');
    expect(body).toBeDefined();
    expect(body).not.toMatch(/"TfNo"|"TfDate"/);
    expect(body).toMatch(/"Quantity":44000[,}]/);
  });

  it('refuses an upload row whose BL Number SAP already holds', async () => {
    const row = { notifyParty: 'Olam', blNumber: 'NAM6036645', blDate: '2023-02-07', etd: '2023-02-07', eta: '2023-03-07', contractRef: '1', contractDate: '', invoiceRef: '2', invoiceDate: '2026-02-08', commodity: 'ALMOND', goods: 'X', quantity: '1', unit: 'LBS' };
    const check = await uploadService(cfg, 'tradeflow-upload').check(user, { rows: [row] });
    expect(check.lines[0].problems).toEqual(['NAM6036645 already exists.']);
  });

  it('opens a trade flow with its Bill of Lading in one request', async () => {
    const obj = await objectService(cfg, 'tradeflow').read(user, { tfNo: 'TF00000001', tfDate: '2026-10-15' });
    expect(obj.header).toMatchObject({ tfNo: 'TF00000001', blNumber: 'NAM6036645', commodity: 'ALMOND' });
    expect(obj.items.bl.map(b => b.blNo)).toEqual(['BL00000001']);
    const get = sap.log.filter(r => r.method === 'GET')[0];
    expect(decodeURIComponent(get.rel)).toBe("TradeFlow(TfNo='TF00000001',TfDate=2026-10-15)");
    expect(get.query.get('$expand')).toBe('_BillOfLading');
  });

  it('restores the registry', () => { for (const id of IDS) SERVER_MODULES[id] = saved[id]; });
});
