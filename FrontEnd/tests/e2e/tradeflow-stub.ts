// tests/e2e/tradeflow-stub.ts
// What the trade-flow screens reach in the e2e tests, answered from the modules' sample data:
// - ZFS_SB_TRADEFLOW_O4_API through the relay stub (127.0.0.1:3399): Commodity, CommodityPrice, TsfCommodity, TradeFlow
//   (with _BillOfLading [0..*]) and BillOfLading. Reads support $filter, $orderby, $skip, $top and $count; writes are
//   POST TradeFlow (SAP numbers it and creates its BL), POST TradeFlow(...)/_BillOfLading (SAP numbers the BL) and PATCH
//   BillOfLading(...), alone or in a $batch changeset.
// - ZFS_SB_EXCHANGERATE_O4_API: one rate, INR → USD (type M).
// - The BackEnd's Deal IDs and master contracts (SLC middleware) and its AI route (always "not configured" here, so no
//   test can reach Anthropic).
import type { Page, Route } from '@playwright/test';
import { COMMODITY_ROWS } from '../../src/modules/commodity/seed';
import { PRICE_ROWS } from '../../src/modules/commodity-price/seed';
import { tradeflowManageSeed } from '../../src/modules/tradeflow-manage/seed';
import { compileFilter, orderRows } from '../support/odata-filter';
import { RELAY_ORIGIN } from './relay-stub';

type Row = Record<string, unknown>;
const PATH = '/sap/opu/odata4/sap/zfs_sb_tradeflow_o4_api/srvd_a2x/sap/zfs_sd_tradeflow/0001/';
const RATES = '/sap/opu/odata4/sap/zfs_sb_exchangerate_o4_api/';
const NUMBERS = new Set(['quantity', 'price', 'value', 'assignedUsd', 'blCount']);
const nl = '\r\n';
const pascal = (f: string) => f.charAt(0).toUpperCase() + f.slice(1);
const toSap = (r: Record<string, string>): Row => Object.fromEntries(Object.entries(r).map(([f, v]) => [pascal(f), NUMBERS.has(f) ? (v === '' ? null : Number(v)) : v]));
const today = () => new Date().toISOString().slice(0, 10);
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };

/** The middleware's Deal IDs and master contracts as Propose reads them (one INR deal, one without a USD rate). */
export const DEALS = [
  { dealId: '7000000101', dealDesc: 'Almond forward, October', mcRef: '2000000501', dealAmount: '189200.00', dealCurrDesc: 'USD-USD-INR' },
  { dealId: '7000000142', dealDesc: 'Almond INR deal', mcRef: '2000000501', dealAmount: '23650000.00', dealCurrDesc: 'INR-INR-INR' },
  { dealId: '7000000160', dealDesc: 'Almond VND deal', mcRef: '2000000501', dealAmount: '2400000000.00', dealCurrDesc: 'VND-VND-USD' }
];
const CONTRACTS = [{ mcNo: '2000000501', commodity: 'C130', commodityDesc: 'ALMOND' }];

/** Answers all of the above on this page (registered after signIn, so it wins over the Time Buckets stub). */
export async function stubTradeflowService(page: Page): Promise<{ created: Row[]; patched: Row[] }> {
  const { tables } = tradeflowManageSeed();
  let version = 1, tf = 3000000010, bl = 4000000200;
  const etag = (r: Row): Row => ({ ...r, '@odata.etag': `W/"${version++}"` });
  const blsOf = (t: Row) => sets.BillOfLading.filter(b => b.TfNo === t.TfNo && b.TfDate === t.TfDate);
  const recount = (t: Row) => {
    const active = blsOf(t).filter(b => b.DeletedFlag !== 'X');
    t.BlCount = active.length;
    t.BlNo = active.length === 1 ? active[0].BlNo : '';
    const ids = [...new Set(active.map(b => String(b.DealId ?? '')))];
    t.DealId = ids.length === 1 ? ids[0] : '';
  };
  const sets: Record<string, Row[]> = {
    Commodity: COMMODITY_ROWS.map(r => toSap({ ...r, tsfCommodity: r.commodity === 'ALMOND' ? 'C130' : '' })).map(etag),
    CommodityPrice: PRICE_ROWS.map(toSap).map(etag),
    TsfCommodity: [{ Commodity: 'C105', Description: 'CORN' }, { Commodity: 'C130', Description: 'ALMOND' }],
    TradeFlow: tables.tradeflows.map(t => toSap({ ...t, blCount: '1' })).map(etag),
    BillOfLading: tables.bl.map(toSap).map(etag)
  };
  for (const t of sets.TradeFlow) recount(t);
  const created: Row[] = [], patched: Row[] = [];
  const fail = (message: string) => ({ status: 400, body: JSON.stringify({ error: { message } }) });
  const newBl = (t: Row, data: Row): Row => etag({ ...data, TfNo: t.TfNo, TfDate: t.TfDate, BlNo: String(++bl), BlRecordDate: today(), DealId: data.DealId ?? '', DeletedFlag: data.DeletedFlag ?? '', AssignedUsd: data.AssignedUsd ?? null });
  /** One write, as SAP answers it. */
  function write(method: string, rel: string, body: string): { status: number; body: string } {
    const data = JSON.parse(body || '{}') as Row;
    const nav = /^TradeFlow\(TfNo='([^']*)',TfDate=([\d-]+)\)\/_BillOfLading$/.exec(rel);
    if (method === 'POST' && nav) {
      const t = sets.TradeFlow.find(x => x.TfNo === nav[1] && x.TfDate === nav[2]);
      if (!t) return fail('Trade flow not found');
      const b = newBl(t, data);
      sets.BillOfLading.push(b);
      recount(t);
      return { status: 201, body: JSON.stringify(b) };
    }
    if (method === 'POST' && rel === 'TradeFlow') {
      if (sets.TradeFlow.some(r => r.BlNumber === data.BlNumber)) return fail(`BL Number ${String(data.BlNumber)} already exists`);
      const t = etag({ ...data, TfNo: String(++tf), TfDate: today(), Price: null, Value: null, Currency: '' });
      sets.TradeFlow.push(t);
      sets.BillOfLading.push(newBl(t, data));
      recount(t);
      created.push(t);
      return { status: 201, body: JSON.stringify(t) };
    }
    if (method === 'POST' && /^\w+$/.test(rel)) { sets[rel]?.push(etag(data)); return { status: 201, body: JSON.stringify(data) }; }
    const one = /^BillOfLading\(BlNo='([^']*)',BlRecordDate=([\d-]+)\)$/.exec(rel);
    if (method === 'PATCH' && one) {
      const b = sets.BillOfLading.find(x => x.BlNo === one[1] && x.BlRecordDate === one[2]);
      if (!b) return { status: 404, body: JSON.stringify({ error: { message: 'BL not found' } }) };
      Object.assign(b, data, { '@odata.etag': `W/"${version++}"` });
      if (data.DeletedFlag === 'X') Object.assign(b, { DeletedBy: 'TESTER', DeletedAt: `${today()} 10:00` });
      patched.push({ ...data, BlNo: b.BlNo });
      const t = sets.TradeFlow.find(x => x.TfNo === b.TfNo && x.TfDate === b.TfDate);
      if (t) recount(t);
      return { status: 200, body: JSON.stringify(b) };
    }
    if (method === 'DELETE') return fail('Use the delete flag');
    return { status: 405, body: '{}' };
  }
  const json = (route: Route, status: number, body: unknown, headers: Record<string, string> = {}) =>
    route.fulfill({ status, headers: { 'content-type': 'application/json', ...CORS, ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

  await page.route(`${RELAY_ORIGIN}${PATH}**`, async route => {
    const req = route.request();
    const url = new URL(req.url());
    const rel = decodeURIComponent(url.pathname.slice(PATH.length));
    const headers = req.headers();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (headers['x-csrf-token'] === 'Fetch') return json(route, 200, '{}', { 'x-csrf-token': 'stub-csrf-token' });
    if (rel === '$metadata') return route.fulfill({ status: 200, headers: { 'content-type': 'application/xml', ...CORS }, body: '<?xml version="1.0"?><edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx"><edmx:DataServices/></edmx:Edmx>' });
    if (req.method() === 'POST' && rel === '$batch') {
      const body = req.postData() ?? '';
      const boundary = /boundary=([^\s;]+)/.exec(body)?.[1];
      const parts = boundary ? body.split(`--${boundary}`).slice(1).filter(p => !p.startsWith('--')) : [];
      const answers = [];
      for (const part of parts) {
        const sections = part.split(nl + nl);
        const [method, path] = (sections[1] ?? '').split(nl)[0].split(' ');
        const a = write(method, decodeURIComponent(path), sections.slice(2).join(nl + nl).trim());
        answers.push(a);
        if (a.status >= 400) break;
      }
      const bad = answers.find(a => a.status >= 400);
      const head = { 'content-type': 'multipart/mixed; boundary=batchresponse_1', ...CORS };
      if (bad) return route.fulfill({ status: 200, headers: head, body: `--batchresponse_1${nl}Content-Type: application/http${nl}Content-Transfer-Encoding: binary${nl}${nl}HTTP/1.1 ${bad.status} Error${nl}Content-Type: application/json${nl}${nl}${bad.body}${nl}--batchresponse_1--${nl}` });
      const out = answers.map((a, i) => `--changesetresponse_1${nl}Content-Type: application/http${nl}Content-Transfer-Encoding: binary${nl}Content-ID: ${i + 1}${nl}${nl}HTTP/1.1 ${a.status} OK${nl}Content-Type: application/json${nl}${nl}${a.body}${nl}`).join('');
      return route.fulfill({ status: 200, headers: head, body: `--batchresponse_1${nl}Content-Type: multipart/mixed; boundary=changesetresponse_1${nl}${nl}${out}--changesetresponse_1--${nl}--batchresponse_1--${nl}` });
    }
    if (req.method() !== 'GET') { const a = write(req.method(), rel, req.postData() ?? ''); return json(route, a.status, a.body); }
    const one = /^TradeFlow\(TfNo='([^']*)',TfDate=([\d-]+)\)$/.exec(rel);
    if (one) {
      const row = sets.TradeFlow.find(r => r.TfNo === one[1] && r.TfDate === one[2]);
      return row ? json(route, 200, { ...row, _BillOfLading: blsOf(row) }) : json(route, 404, { error: { message: 'Not found' } });
    }
    const list = sets[rel];
    if (!list) return json(route, 404, { error: { message: `Unknown entity set ${rel}` } });
    const filter = url.searchParams.get('$filter'), orderby = url.searchParams.get('$orderby');
    let rows = filter ? list.filter(compileFilter(filter)) : list;
    if (orderby) rows = orderRows(rows, orderby);
    const skip = Number(url.searchParams.get('$skip') ?? 0);
    const top = url.searchParams.has('$top') ? Number(url.searchParams.get('$top')) : Infinity;
    const count = url.searchParams.get('$count') === 'true' ? { '@odata.count': rows.length } : {};
    return json(route, 200, { '@odata.context': `$metadata#${rel}`, ...count, value: rows.slice(skip, skip + top) });
  });

  await page.route(`${RELAY_ORIGIN}${RATES}**`, async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const filter = new URL(route.request().url()).searchParams.get('$filter') ?? '';
    const inr = filter.includes("SourceCurrency eq 'INR'") && filter.includes("TargetCurrency eq 'USD'");
    return json(route, 200, { value: inr ? [{ RateType: 'M', SourceCurrency: 'INR', TargetCurrency: 'USD', ExchangeRateEffectiveDate: '2026-11-01', ExchangeRate: 0.012, NumberOfSourceCurrencyUnits: 1, NumberOfTargetCurrencyUnits: 1 }] : [] });
  });

  const page1 = (rows: Record<string, string>[]) => ({ rows, total: rows.length, page: 1, pageSize: 500 });
  await page.route('**/api/modules/tsf-deal-id/dealIds/query', route => json(route, 200, page1(DEALS)));
  await page.route('**/api/modules/master-contract/contracts/query', route => json(route, 200, page1(CONTRACTS)));
  await page.route('**/api/ai/proposals', route => json(route, 503, { error: { message: 'AI is not configured.', details: [] } }));
  return { created, patched };
}
