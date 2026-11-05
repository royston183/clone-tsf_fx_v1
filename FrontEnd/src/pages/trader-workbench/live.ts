// Live reads of FO: Trader Workbench (read only; nothing is written). Every read goes through the data client:
//   Deal IDs        tsf-deal-id (rest, the middleware's ZSGTSFTR_DEALID), with the master contract of each deal (master-contract)
//   Masters         wb-masters (rest): models, deal status texts, region, trader names, action texts, settlement spot data
//   Transactions    tsf-deals (SAP through the relay), over a wide blotter range, grouped by Deal ID
import type { Row } from '@/lib/grid/types';
import { moduleQuery, moduleView, reportRun } from '@/lib/client/data';
import type { Deal, Option, Txn } from './data';

/** The blotter range that reads every transaction (the report needs a date range). */
export const ALL_DATES = { blotterDate: '2000-01-01', blotterTo: '2099-12-31' };

export interface WbData {
  deals: Deal[];
  txns: Txn[];
  models: Option[];
  dealStatuses: Option[];
  /** Reads that failed without stopping the deal list (the page says so). */
  warnings: string[];
  readAt: string;
}

const s = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());
const n = (v: unknown): number => { const x = Number(s(v).replace(/,/g, '')); return Number.isFinite(x) ? x : 0; };
const nOrNull = (v: unknown): number | null => (s(v) === '' || !Number.isFinite(Number(s(v))) ? null : Number(s(v)));
const day = (v: unknown): string => s(v).slice(0, 10);
export const messageOf = (e: unknown): string => (e instanceof Error && e.message ? e.message : 'Something went wrong. Try again.');

/** Every row of a list, page by page (the lists here are small). */
async function allRows(module: string, table: string, pageSize: number, signal?: AbortSignal): Promise<Row[]> {
  const rows: Row[] = [];
  for (let page = 1; ; page++) {
    const r = await moduleQuery(module, table, { filters: [], page, pageSize }, signal);
    rows.push(...r.rows);
    if (rows.length >= r.total || r.rows.length === 0) return rows;
  }
}

export function txnFromRow(r: Row, actions: Row[], spots: Row[]): Txn {
  const type = s(r.transactionType);
  const spot = spots.find(x => x.rfha === s(r.rfha) && x.dealId === s(r.dealId));
  const status = s(r.txnStatus);
  return {
    id: s(r.rfha), dealId: s(r.dealId), co: s(r.companyCode), dealType: s(r.dealType), txnType: type, partner: s(r.partner) || s(r.partnerCode),
    trade: day(r.tradeDate), value: day(r.valueDate), bs1: s(r.bs1), cur1: s(r.curr1), amt1: n(r.amount1), bs2: s(r.bs2), cur2: s(r.curr2), amt2: n(r.amount2),
    spot: nOrNull(r.spotRate), strike: null, allIn: nOrNull(r.allInRate), status, statusText: s(r.statusText),
    ndfFixDate: day(r.ndfFixDate) || null, ndfRate: null, settled: status === '50', hasSpot: spot?.spotCreate === 'X',
    invoiceAmt: spot ? n(spot.invoiceAmt) : null, invoiceDiff: spot ? n(spot.diffAmt) : null, fixRef: s(r.ndfRef) || undefined,
    actionText: (actions.find(a => a.txnType === type && a.code === '01') ?? actions.find(a => a.txnType === type))?.text ?? ''
  };
}

export async function loadWorkbench(signal?: AbortSignal): Promise<WbData> {
  const warnings: string[] = [];
  const [view, dealRows, mcRows, txnRows] = await Promise.all([
    moduleView('wb-masters'),
    allRows('tsf-deal-id', 'dealIds', 500, signal),
    allRows('master-contract', 'contracts', 100, signal).catch(e => { warnings.push(`Master contracts could not be read (${messageOf(e)}): origin and MC amount are blank.`); return [] as Row[]; }),
    reportRun('tsf-deals', { selection: ALL_DATES }, signal).then(r => r.rows).catch(e => { warnings.push(`Transactions could not be read from SAP (${messageOf(e)}): action items are not listed.`); return [] as Row[]; })
  ]);
  const lk = view.lookups;
  const traders = new Map(view.tables.traders?.map(t => [s(t.code), s(t.name)]) ?? []);
  const models = new Map<string, Row>();
  for (const m of lk.models ?? []) if (!models.has(s(m.id))) models.set(s(m.id), m);
  const regions = new Map<string, string>();
  for (const m of lk.models ?? []) if (s(m.regionId) && s(m.regionText)) regions.set(s(m.regionId), s(m.regionText));
  const statusText = new Map((lk.dealStatus ?? []).map(d => [s(d.code), s(d.text)]));
  const mcs = new Map(mcRows.map(m => [s(m.mcNo), m]));

  const deals: Deal[] = dealRows.map(d => {
    const mc = mcs.get(s(d.mcRef));
    const status = s(d.status);
    return {
      id: s(d.dealId), type: s(d.dealType), subType: s(d.subType), desc: s(d.dealDesc), model: s(d.model), status, origin: s(mc?.origin), mc: s(d.mcRef),
      start: day(d.startDate), end: day(d.endDate), mcDate: day(mc?.mcDate), mcCurr: s(d.mcCurrDesc), dealCurr: s(d.dealCurrDesc), mcAmount: n(mc?.amountUsd),
      mcAmountCurr: s(mc?.currency) || 'USD', pl: n(d.pl), plCurr: s(d.plCurr), plRate: n(d.plRate), plLocal: n(d.plLocal), localCurr: s(d.plLocalCurr),
      trader: s(d.traderCode), traderName: traders.get(s(d.traderCode)) ?? '', region: regions.get(s(d.regionId)) ?? s(d.regionId), ref: s(d.dealRef),
      straddle: s(d.shortStraddle) === 'X', closed: /^settlement completed/i.test(statusText.get(status) ?? '')
    };
  });
  const actions = lk.actions ?? [], spots = lk.inSpot ?? [];
  const txns = txnRows.filter(r => !(s(r.reversed) === 'X' || s(r.reversed) === 'true')).map(r => txnFromRow(r, actions, spots));
  return {
    deals, txns,
    models: [...models.values()].map(m => ({ code: s(m.id), text: s(m.text) })).sort((a, b) => a.code.localeCompare(b.code)),
    dealStatuses: [...statusText].map(([code, text]) => ({ code, text })).sort((a, b) => a.code.localeCompare(b.code)),
    warnings, readAt: new Date().toISOString()
  };
}
