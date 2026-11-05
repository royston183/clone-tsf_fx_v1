// tests/e2e/tradeflow-stub.ts
// ZFS_SB_TRADEFLOW_O4_API as the e2e browser sees it through the relay stub (127.0.0.1:3399), answered from the
// modules' sample data: Commodity, CommodityPrice, TradeFlow (with _BillOfLading) and BillOfLading. Reads support
// $filter, $orderby, $skip, $top and $count; a POST of a TradeFlow (alone or in a $batch changeset) gets a TF No, the
// upload date and its BL, as SAP's early numbering and determination do. No real relay or SAP system is involved.
import type { Page, Route } from '@playwright/test';
import { COMMODITY_ROWS } from '../../src/modules/commodity/seed';
import { PRICE_ROWS } from '../../src/modules/commodity-price/seed';
import { tradeflowSeed } from '../../src/modules/tradeflow/seed';
import { compileFilter, orderRows } from '../support/odata-filter';
import { RELAY_ORIGIN } from './relay-stub';

type Row = Record<string, unknown>;
const PATH = '/sap/opu/odata4/sap/zfs_sb_tradeflow_o4_api/srvd_a2x/sap/zfs_sd_tradeflow/0001/';
const NUMBERS = new Set(['quantity', 'price', 'value']);
const nl = '\r\n';
const pascal = (f: string) => f.charAt(0).toUpperCase() + f.slice(1);
const toSap = (r: Record<string, string>): Row => Object.fromEntries(Object.entries(r).map(([f, v]) => [pascal(f), NUMBERS.has(f) ? (v === '' ? null : Number(v)) : v]));
const today = () => new Date().toISOString().slice(0, 10);

/** Answers the trade-flow service on this page (registered after signIn, so it wins over the Time Buckets stub). */
export async function stubTradeflowService(page: Page): Promise<{ created: Row[] }> {
  const { tables } = tradeflowSeed();
  let version = 1, tf = 3000000010, bl = 4000000007;
  const etag = (r: Row): Row => ({ ...r, "@odata.etag": `W/"${version++}"` });
  const sets: Record<string, Row[]> = {
    Commodity: COMMODITY_ROWS.map(toSap).map(etag),
    CommodityPrice: PRICE_ROWS.map(toSap).map(etag),
    TradeFlow: tables.tradeflows.map(toSap).map(etag),
    BillOfLading: tables.bl.map(toSap).map(etag)
  };
  const created: Row[] = [];
  const create = (set: string, body: string): { status: number; body: string } => {
    const row = JSON.parse(body || '{}') as Row;
    if (set !== 'TradeFlow') { sets[set]?.push(etag(row)); return { status: 201, body: JSON.stringify(row) }; }
    if (sets.TradeFlow.some(r => r.BlNumber === row.BlNumber)) return { status: 400, body: JSON.stringify({ error: { message: `BL Number ${String(row.BlNumber)} already exists` } }) };
    const header = etag({ ...row, TfNo: String(++tf), TfDate: today(), BlNo: String(++bl), Price: null, Value: null, Currency: '' });
    sets.TradeFlow.push(header);
    sets.BillOfLading.push(etag({ ...row, BlNo: header.BlNo, BlRecordDate: today(), TfNo: header.TfNo, TfDate: header.TfDate }));
    created.push(header);
    return { status: 201, body: JSON.stringify(header) };
  };
  const json = (route: Route, status: number, body: unknown, headers: Record<string, string> = {}) =>
    route.fulfill({ status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-expose-headers': '*', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

  await page.route(`${RELAY_ORIGIN}${PATH}**`, async route => {
    const req = route.request();
    const url = new URL(req.url());
    const rel = decodeURIComponent(url.pathname.slice(PATH.length));
    const headers = req.headers();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (headers['x-csrf-token'] === 'Fetch') return json(route, 200, '{}', { 'x-csrf-token': 'stub-csrf-token' });
    if (rel === '$metadata') return route.fulfill({ status: 200, headers: { 'content-type': 'application/xml', 'access-control-allow-origin': '*' }, body: '<?xml version="1.0"?><edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx"><edmx:DataServices/></edmx:Edmx>' });
    if (req.method() === 'POST' && rel === '$batch') {
      const body = req.postData() ?? '';
      const boundary = /boundary=([^\s;]+)/.exec(body)?.[1];
      const parts = boundary ? body.split(`--${boundary}`).slice(1).filter(p => !p.startsWith('--')) : [];
      const answers = parts.map(part => {
        const sections = part.split(nl + nl);
        const [method, path] = (sections[1] ?? '').split(nl)[0].split(' ');
        return method === 'POST' ? create(path, sections.slice(2).join(nl + nl).trim()) : { status: 405, body: '{}' };
      });
      const bad = answers.find(a => a.status >= 400);
      const head = { 'content-type': 'multipart/mixed; boundary=batchresponse_1', 'access-control-allow-origin': '*', 'access-control-expose-headers': '*' };
      if (bad) return route.fulfill({ status: 200, headers: head, body: `--batchresponse_1${nl}Content-Type: application/http${nl}Content-Transfer-Encoding: binary${nl}${nl}HTTP/1.1 ${bad.status} Error${nl}Content-Type: application/json${nl}${nl}${bad.body}${nl}--batchresponse_1--${nl}` });
      const out = answers.map((a, i) => `--changesetresponse_1${nl}Content-Type: application/http${nl}Content-Transfer-Encoding: binary${nl}Content-ID: ${i + 1}${nl}${nl}HTTP/1.1 ${a.status} OK${nl}Content-Type: application/json${nl}${nl}${a.body}${nl}`).join('');
      return route.fulfill({ status: 200, headers: head, body: `--batchresponse_1${nl}Content-Type: multipart/mixed; boundary=changesetresponse_1${nl}${nl}${out}--changesetresponse_1--${nl}--batchresponse_1--${nl}` });
    }
    if (req.method() === 'POST' && /^\w+$/.test(rel)) { const a = create(rel, req.postData() ?? ''); return json(route, a.status, a.body); }
    const one = /^TradeFlow\(TfNo='([^']*)',TfDate=([\d-]+)\)$/.exec(rel);
    if (one) {
      const row = sets.TradeFlow.find(r => r.TfNo === one[1] && r.TfDate === one[2]);
      if (!row) return json(route, 404, { error: { message: 'Not found' } });
      return json(route, 200, { ...row, _BillOfLading: sets.BillOfLading.filter(b => b.TfNo === row.TfNo && b.TfDate === row.TfDate) });
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
  return { created };
}
