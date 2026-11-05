// TSF MO Deal Confirmation: the queue (the tsf-deals report and the Deal IDs' over-limit flag) and the MO writes
// (Settle on FxTransaction, then TrmFxApp), run through the real object service and OData backend against a mock SAP.
// Nothing here touches a live system.
import type { Actor } from '@core/actor';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newSapConnection } from '@core/sap/client';
import type { AppConfig } from '@core/server/config';
import { CONFLICT_MESSAGE } from '@core/server/odata-backend';
import { objectService } from '@core/server/object-service';
import { loadQueue, QUEUE_FROM, toConfDeal, type QueueIo } from '@/pages/deal-confirmation/live';
import { matchAndReleaseDeal, matchAndReleaseDeals, requestCorrectionDeals, type FxIo, type Target } from '@/pages/deal-confirmation/workflow';
import type { Row } from '@/lib/grid/types';
import { actingAs, installTestPlatform, relayConfig } from '../support/platform';
import { startMockSap, type MockRow, type MockSap } from '../support/mock-sap';

installTestPlatform();

const SETTLE = 'com.sap.gateway.srvd_a2x.zfs_sd_trmfx.v0001.Settle';

/** A TrmFxApp row as SAP returns it (names from the live $metadata). */
const appRow = (rfha: string, status: string, over: MockRow = {}): MockRow => ({
  CompanyCode: 'IN11', FinancialTransaction: rfha, ZtsfDealType: 'DS1', ZtsfDealID: '7000000075', ZtsfDealDesc: 'Nidhi S_OSIPL_2026/OGA-DMCC-OSIPL', ZtsfMcRefNo: '2000000055',
  ZtsfExOptNo: '2000000000079', ZtsfExSpotNo: '', ZtsfBcurr: 'INR', ZtsfBhbkID: 'HB002', ZtsfBhktID: 'HDFC0', ZtsfScurr: 'USD', ZtsfShbkID: '', ZtsfShktID: '',
  ZtsfExeCo: true, ZtsfAccCo: false, ZtsfBpayID: '', ZtsfSpayID: '', ZtsfRbukrs: 'IN11', ZtsfRpayID: '', ZtsfPbukrs: 'IN11', ZtsfPpayID: '', ZtsfTrftype: '', ZtsfTrftype2: '04',
  ZtsfBnktype: '01', ZtsfBnktype2: '04', ZtsfDealSq: '', ZtsfPreMature: false, ZtsfUnwind: false, NdfFoRem: 'FO note', NdfMoRem: '', OptFoRem: '', OptMoRem: '', ZolamDealNo: '',
  TxnStatus: status, Ztrcode: 'C', BlotterDate: '2026-11-24', LocalCreatedBy: 'FS_DEV', LocalCreatedAt: '2026-10-21T07:50:59.835351Z', ...over
});
const fxRow = (rfha: string, category = '20'): MockRow => ({
  CompanyCode: 'IN11', FinancialTransaction: rfha, ProductType: 'T60', TransactionType: 'TT6', Partner: '400000003', ContractDate: '2026-08-26', ValuationClass: '5', Portfolio: '',
  BuyCurrency: 'USD', SellCurrency: 'INR', LeadCurrency: 'USD', FollowCurrency: 'INR', TradedCurrency: 'USD', BuyAmount: 100000, SellAmount: 9600000, ValueDate: '2026-11-26',
  SpotRate: 96, SwapRate: 0, ForwardRate: 96, NdfFixingCurrency: '', NdfFixingDate: null, FixingReferenceId: '', ActiveStatus: '0', ActivityCategory: category
});
const KEYS = ['CompanyCode', 'FinancialTransaction'];
const target = (rfha: string, dealId = '7000000075'): Target => ({ dealId, companyCode: 'IN11', transaction: rfha });

describe('MO writes against a mock SAP', () => {
  let sap: MockSap;
  let cfg: AppConfig;
  let user: Actor;
  let io: FxIo;
  const app = (rfha: string) => sap.sets.TrmFxApp.rows.find(r => r.FinancialTransaction === rfha) as MockRow;
  const fx = (rfha: string) => sap.sets.FxTransaction.rows.find(r => r.FinancialTransaction === rfha) as MockRow;
  const posts = () => sap.log.filter(r => r.method === 'POST' && r.rel === '$batch');
  /** The data client's calls, answered by the real object service and OData backend. */
  const ioOf = (): FxIo => ({
    read: (module, key) => objectService(cfg, module).read(user, key),
    update: (module, body) => objectService(cfg, module).update(user, body),
    action: (module, action, body) => objectService(cfg, module).action(user, action, body)
  });

  beforeEach(async () => {
    user = actingAs(newSapConnection('TESTER', 'secret'));
    sap = await startMockSap({
      sets: {
        TrmFxApp: { key: 'CompanyCode', keys: KEYS, rows: [appRow('1000000000002', '03'), appRow('1000000000003', '06', { ZtsfDealType: '00' }), appRow('1000000000004', '04'), appRow('1000000000005', '07'), appRow('1000000000006', '03')] },
        FxTransaction: {
          key: 'CompanyCode', keys: KEYS,
          rows: ['2', '3', '4', '5'].map(n => fxRow(`100000000000${n}`)).concat(fxRow('1000000000006', '30')),
          actions: { [SETTLE]: row => { row.ActivityCategory = '30'; } }
        }
      }
    });
    cfg = relayConfig(sap);
    io = ioOf();
  });
  afterEach(async () => { await sap.close(); });

  it('Match & Release settles the transaction, then saves status 07, the MO remark and the internal reference', async () => {
    const r = await matchAndReleaseDeal(target('1000000000002'), { extRef: '', intRef: 'OLAM-1', moRemark: 'Matched with bank' }, io);
    expect(r).toMatchObject({ ok: true, done: { key: 'IN11-1000000000002', status: '07' } });
    expect(fx('1000000000002').ActivityCategory).toBe('30');
    expect(app('1000000000002')).toMatchObject({ TxnStatus: '07', NdfMoRem: 'Matched with bank', ZolamDealNo: 'OLAM-1', NdfFoRem: 'FO note' });
    // Settle first, then one PATCH of the changed properties only, conditional on the ETag just read.
    const [settle, patch] = posts();
    expect(settle.body).toMatch(/POST FxTransaction\(CompanyCode='IN11',FinancialTransaction='1000000000002'\)\/com\.sap\.gateway\.srvd_a2x\.zfs_sd_trmfx\.v0001\.Settle HTTP\/1\.1/);
    expect(patch.body).toMatch(/PATCH TrmFxApp\(CompanyCode='IN11',FinancialTransaction='1000000000002'\) HTTP\/1\.1/);
    expect(patch.body).toMatch(/If-Match: W\//);
    const sent = JSON.parse(/\{[^]*\}/.exec(patch.body.slice(patch.body.indexOf('PATCH')))?.[0] ?? '{}') as Record<string, unknown>;
    expect(sent).toEqual({ TxnStatus: '07', NdfMoRem: 'Matched with bank', ZolamDealNo: 'OLAM-1' });
  });

  it('saves status 59 for a deal of type 00 and sends no remark or reference that was left empty', async () => {
    const r = await matchAndReleaseDeal(target('1000000000003'), { extRef: '', intRef: '', moRemark: '' }, io);
    expect(r).toMatchObject({ ok: true, done: { status: '59' } });
    expect(app('1000000000003')).toMatchObject({ TxnStatus: '59', NdfMoRem: '', ZolamDealNo: '' });
    expect(posts()[1].body).not.toMatch(/NdfMoRem|ZolamDealNo/);
  });

  it('does not settle a transaction SAP already shows settled, and still saves the status', async () => {
    const r = await matchAndReleaseDeal(target('1000000000006'), { extRef: '', intRef: '', moRemark: 'again' }, io);
    expect(r.ok).toBe(true);
    expect(posts().filter(p => p.body.includes('Settle'))).toHaveLength(0);
    expect(app('1000000000006').TxnStatus).toBe('07');
  });

  it('refuses a deal MO cannot act on before anything is written (04, 07)', async () => {
    for (const [rfha, why] of [['1000000000004', 'already with FO for correction'], ['1000000000005', 'already been matched and released']] as const) {
      const r = await matchAndReleaseDeal(target(rfha), { extRef: '', intRef: '', moRemark: '' }, io);
      expect(r).toMatchObject({ ok: false, failure: { stage: 'validate' } });
      expect(r.ok ? '' : r.failure.reason).toContain(why);
    }
    expect(posts()).toHaveLength(0);
  });

  it('refuses a transaction without a workflow record, and over-long values, with no SAP write', async () => {
    const missing = await matchAndReleaseDeal(target('1000000000099'), { extRef: '', intRef: '', moRemark: '' }, io);
    expect(missing).toMatchObject({ ok: false, failure: { stage: 'validate', reason: 'This transaction has no application-data record, so MO cannot process it.' } });
    const long = await matchAndReleaseDeal(target('1000000000002'), { extRef: '', intRef: 'x'.repeat(16), moRemark: '' }, io);
    expect(long).toMatchObject({ ok: false, failure: { reason: 'External Ref must be at most 16 characters and Internal Ref at most 15 characters.' } });
    const remark = await matchAndReleaseDeal(target('1000000000002'), { extRef: '', intRef: '', moRemark: 'x'.repeat(81) }, io);
    expect(remark).toMatchObject({ ok: false, failure: { reason: 'MO Remarks must be at most 80 characters.' } });
    expect(posts()).toHaveLength(0);
  });

  it('refuses an External Ref before anything is read or written (FxTransaction has no such property)', async () => {
    const r = await matchAndReleaseDeal(target('1000000000002'), { extRef: 'BANK-1', intRef: '', moRemark: '' }, io);
    expect(r).toMatchObject({ ok: false, failure: { stage: 'validate' } });
    expect(sap.log).toHaveLength(0);
  });

  it('stops at a failed settlement: the status is not changed and the reason is SAP\'s', async () => {
    sap.failNext(400, 'No payment details entered', 'POST');
    const r = await matchAndReleaseDeal(target('1000000000002'), { extRef: '', intRef: '', moRemark: 'x' }, io);
    expect(r).toMatchObject({ ok: false, failure: { stage: 'settle' } });
    expect(r.ok ? '' : r.failure.reason).toContain('No payment details entered');
    expect(app('1000000000002').TxnStatus).toBe('03');
    expect(fx('1000000000002').ActivityCategory).toBe('20');
  });

  it('reports a failed workflow save after a successful settlement, and a repeat does not settle again', async () => {
    const failing: FxIo = { ...io, update: async () => { throw new Error('Service unavailable'); } };
    const r = await matchAndReleaseDeal(target('1000000000002'), { extRef: '', intRef: '', moRemark: 'x' }, failing);
    expect(r).toMatchObject({ ok: false, failure: { stage: 'workflow', settled: true } });
    expect(r.ok ? '' : r.failure.reason).toMatch(/settled successfully.*Service unavailable.*not settled again/);
    expect(fx('1000000000002').ActivityCategory).toBe('30');
    expect(app('1000000000002').TxnStatus).toBe('03');
    const before = posts().length;
    const again = await matchAndReleaseDeal(target('1000000000002'), { extRef: '', intRef: '', moRemark: 'x' }, io);
    expect(again.ok).toBe(true);
    expect(posts().length - before).toBe(1);
    expect(app('1000000000002').TxnStatus).toBe('07');
  });

  it('a record changed by someone else between the read and the save is a conflict, not an overwrite', async () => {
    const stale: FxIo = { ...io, update: async (module, body) => { app('1000000000002')['@odata.etag'] = 'W/"other"'; return io.update(module, body); } };
    const r = await matchAndReleaseDeal(target('1000000000002'), { extRef: '', intRef: '', moRemark: 'x' }, stale);
    expect(r).toMatchObject({ ok: false, failure: { stage: 'workflow' } });
    expect(r.ok ? '' : r.failure.reason).toContain(CONFLICT_MESSAGE);
    expect(app('1000000000002').TxnStatus).toBe('03');
  });

  it('a batch stops at the first failure and keeps what was done before it', async () => {
    const batch = await matchAndReleaseDeals([target('1000000000002'), target('1000000000004'), target('1000000000006')], { extRef: '', intRef: '', moRemark: '' }, io);
    expect(batch.done.map(d => d.key)).toEqual(['IN11-1000000000002']);
    expect(batch.failed).toMatchObject({ dealId: '7000000075', stage: 'validate' });
    expect(app('1000000000002').TxnStatus).toBe('07');
    expect(app('1000000000006').TxnStatus).toBe('03');
  });

  it('Correction Required saves status 04 and the MO remark only, and never calls SAP\'s settlement', async () => {
    const batch = await requestCorrectionDeals([target('1000000000002'), target('1000000000003')], 'Rate mismatch', io);
    expect(batch.failed).toBeUndefined();
    expect(batch.done.map(d => d.status)).toEqual(['04', '04']);
    expect(app('1000000000002')).toMatchObject({ TxnStatus: '04', NdfMoRem: 'Rate mismatch' });
    expect(posts().every(p => !p.body.includes('Settle'))).toBe(true);
    expect(posts()).toHaveLength(2);
    expect(fx('1000000000002').ActivityCategory).toBe('20');
  });

  it('Correction Required needs a remark and refuses a deal already with FO', async () => {
    expect(await requestCorrectionDeals([target('1000000000002')], '  ', io)).toMatchObject({ failed: { reason: 'Please fill the MO Remarks and Update' } });
    const r = await requestCorrectionDeals([target('1000000000004')], 'again', io);
    expect(r.failed?.reason).toContain('already with FO');
    expect(posts()).toHaveLength(0);
  });
});

describe('the queue', () => {
  const row = (over: Row): Row => ({
    companyCode: 'IN11', rfha: '1000000000002', dealId: '7000000075', transactionType: '605', productType: '12A', partner: 'FMC Corporation', tradeDate: '2026-10-01', valueDate: '2026-11-25',
    bs1: 'Sell', curr1: 'USD', amount1: '1752818.63', bs2: 'Buy', curr2: 'INR', amount2: '161855272.72', allInRate: '92.34', trader: 'C27', txnStatus: '03', foRemark: 'fo', moRemark: '', ndfFoRemark: '', ndfMoRemark: '',
    intRef: '', reversed: '', ...over
  });

  it('reads status 03, 04 and 06 from 2000-01-01 up to the chosen day, one run per status', async () => {
    const selections: Row[] = [];
    const io: QueueIo = {
      report: async sel => { selections.push(sel); return { rows: [row({ rfha: `10${String(sel.txnStatus)}`, txnStatus: sel.txnStatus })] } as never; },
      dealIds: async () => ({ rows: [], total: 0, page: 1, pageSize: 500 })
    };
    const q = await loadQueue({ from: '', to: '', upto: '2026-11-04', trader: '' }, io);
    expect(selections).toEqual(['03', '04', '06'].map(txnStatus => ({ blotterDate: QUEUE_FROM, blotterTo: '2026-11-04', txnStatus })));
    expect(q.deals.map(d => d.status)).toEqual(['03', '04', '06']);
    expect(q.warning).toBe('');
  });

  it('passes one company and the trader to SAP, cuts a company range here, and leaves reversed deals out', async () => {
    const seen: Row[] = [];
    const rows = [row({ companyCode: 'AE11' }), row({ companyCode: 'IN11', rfha: '2' }), row({ companyCode: 'SG03', rfha: '3' }), row({ companyCode: 'IN11', rfha: '4', reversed: 'X' })];
    const io: QueueIo = { report: async sel => { seen.push(sel); return { rows: sel.txnStatus === '03' ? rows : [] } as never; }, dealIds: async () => ({ rows: [], total: 0, page: 1, pageSize: 500 }) };
    await loadQueue({ from: 'IN11', to: '', upto: '2026-11-04', trader: 'C27' }, io);
    expect(seen[0]).toMatchObject({ companyCode: 'IN11', trader: 'C27' });
    seen.length = 0;
    const q = await loadQueue({ from: 'AE13', to: 'IN11', upto: '2026-11-04', trader: '' }, io);
    expect(seen[0].companyCode).toBeUndefined();
    expect(q.deals.map(d => d.key)).toEqual(['IN11-2']);
  });

  it('flags the Deal IDs over their limit, reading them 50 at a time, and warns (without losing the queue) when the check fails', async () => {
    const rows = Array.from({ length: 120 }, (_, i) => row({ rfha: `R${i}`, dealId: String(7000000000 + i) }));
    const asked: number[] = [];
    const io: QueueIo = {
      report: async sel => ({ rows: sel.txnStatus === '03' ? rows : [] }) as never,
      dealIds: async ids => { asked.push(ids.length); return { rows: ids.includes('7000000003') ? [{ dealId: '7000000003', overUtil: 'X' }, { dealId: '7000000004', overUtil: '' }] : [], total: 0, page: 1, pageSize: 500 }; }
    };
    const q = await loadQueue({ from: '', to: '', upto: '2026-11-04', trader: '' }, io);
    expect(asked).toEqual([50, 50, 20]);
    expect(q.deals.filter(d => d.overLimit).map(d => d.dealId)).toEqual(['7000000003']);
    const broken: QueueIo = { ...io, dealIds: async () => { throw new Error('BackEnd is not running'); } };
    const w = await loadQueue({ from: '', to: '', upto: '2026-11-04', trader: '' }, broken);
    expect(w.deals).toHaveLength(120);
    expect(w.warning).toContain('BackEnd is not running');
  });

  it('maps a report row to the page\'s deal', () => {
    expect(toConfDeal(row({ ndfFixDate: '2026-11-20' }))).toMatchObject({
      key: 'IN11-1000000000002', dealId: '7000000075', transaction: '1000000000002', partner: 'FMC Corporation', bs1: 'Sell', curr1: 'USD', amount1: 1752818.63,
      curr2: 'INR', amount2: 161855272.72, rate: 92.34, fixingDate: '2026-11-20', valueDate: '2026-11-25', status: '03', trader: 'C27 · Akshay Mohnot', foRemark: 'fo', display: 'FX'
    });
  });
});
