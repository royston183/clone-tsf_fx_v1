// Live reads of DE6: TSF FX Blotter (read only; nothing is written). Every read goes through the data client:
//   Transactions   tsf-deals (SAP through the relay) for the blotter date, shown as Created / Released / Reversed by txnStatus
//   Masters        wb-masters (rest): trader groups and traders, business partners, company codes
//   Open MCs       master-contract (rest), status 03 / 04
//   Open Deal IDs  tsf-deal-id (rest), not cancelled and not short-straddle
import type { Row } from '@/lib/grid/types';
import { moduleQuery, moduleView, reportRun } from '@/lib/client/data';
import { TXN_TYPES } from '@/pages/fx/sample';
import { nextId, type BlotterRow, type Mc, type OpenDeal, type Status } from './data';
import type { BlGroup, Code } from './masters';

export interface BlMasterData {
  groups: BlGroup[];
  /** Business partners per group (bp, name, group). */
  partners: { bp: string; name: string; group: string }[];
  /** Every business partner name by BP number (display of any row). */
  bpNames: Record<string, string>;
  companies: Code[];
  txnStatus: Record<string, string>;
  mcs: Mc[];
  deals: OpenDeal[];
  /** Reads that failed without stopping the blotter (the page says so). */
  warnings: string[];
  readAt: string;
}

const s = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());
const n = (v: unknown): number => { const x = Number(s(v).replace(/,/g, '')); return Number.isFinite(x) ? x : 0; };
const day = (v: unknown): string => s(v).slice(0, 10);
export const messageOf = (e: unknown): string => (e instanceof Error && e.message ? e.message : 'Something went wrong. Try again.');

async function allRows(module: string, table: string, pageSize: number, filters: unknown[] = [], signal?: AbortSignal): Promise<Row[]> {
  const rows: Row[] = [];
  for (let page = 1; ; page++) {
    const r = await moduleQuery(module, table, { filters, page, pageSize }, signal);
    rows.push(...r.rows);
    if (rows.length >= r.total || r.rows.length === 0) return rows;
  }
}

/** A master contract that deals can still use (ZMC_STAT 03 Confirmed or 04 In Use), as the blotter's dialogs list it. */
export function mcFromRow(m: Row, models: Map<string, Row>): Mc {
  const model = models.get(s(m.model));
  const parts = s(model?.currencyString).split('-').filter(Boolean);
  const origin = s(m.originCurrency);
  const pair = origin && origin !== 'USD' ? `USD/${origin}` : parts.length >= 2 ? `${parts[0]}/${parts[parts.length - 1]}` : 'USD/INR';
  return {
    mc: s(m.mcNo), model: s(m.model), commodity: [s(m.commodity), s(m.commodityDesc)].filter(Boolean).join(' '), pair,
    entityString: s(model?.entityString) || s(m.entityDesc), mcDate: day(m.mcDate), shipStart: day(m.shipStart), shipEnd: day(m.shipEnd),
    amountUsd: n(m.amountUsd), usedUsd: n(m.utilised)
  };
}

export function dealFromRow(d: Row): OpenDeal {
  const legs = [1, 2, 3, 4, 5, 6, 7, 8].filter(i => s(d[`rfha${i}`])).length;
  return { dealId: s(d.dealId), mc: s(d.mcRef), model: s(d.model), type: s(d.subType) || s(d.dealType), legs };
}

export async function loadBlotterMasters(signal?: AbortSignal): Promise<BlMasterData> {
  const warnings: string[] = [];
  const [view, mcRows, dealRows] = await Promise.all([
    moduleView('wb-masters'),
    allRows('master-contract', 'contracts', 100, [{ field: 'status', op: 'in', values: ['03', '04'] }], signal)
      .catch(e => { warnings.push(`Open master contracts could not be read (${messageOf(e)}).`); return [] as Row[]; }),
    allRows('tsf-deal-id', 'dealIds', 500, [], signal)
      .catch(e => { warnings.push(`Open Deal IDs could not be read (${messageOf(e)}).`); return [] as Row[]; })
  ]);
  const lk = view.lookups;
  const models = new Map<string, Row>();
  for (const m of lk.models ?? []) if (!models.has(s(m.id))) models.set(s(m.id), m);

  const byGroup = new Map<string, { text: string; traders: Map<string, string> }>();
  for (const g of lk.groups ?? []) {
    const e = byGroup.get(s(g.group)) ?? { text: s(g.groupText), traders: new Map<string, string>() };
    if (s(g.traderCode)) e.traders.set(s(g.traderCode), s(g.name) || s(g.short));
    byGroup.set(s(g.group), e);
  }
  const groups: BlGroup[] = [...byGroup].filter(([code]) => code).sort(([a], [b]) => a.localeCompare(b))
    .map(([code, e]) => ({ code, text: e.text, traders: [...e.traders].map(([c, text]) => ({ code: c, text })).sort((a, b) => a.code.localeCompare(b.code)) }));

  const bpNames = Object.fromEntries((lk.bps ?? []).map(b => [s(b.bp), s(b.short) || s(b.name)]));
  const partners = (lk.bpGroups ?? []).filter(b => bpNames[s(b.bp)] !== undefined).map(b => ({ bp: s(b.bp), name: bpNames[s(b.bp)], group: s(b.group) }));
  return {
    groups, partners, bpNames,
    companies: (lk.companies ?? []).filter(c => s(c.code)).map(c => ({ code: s(c.code), text: s(c.name) })).sort((a, b) => a.code.localeCompare(b.code)),
    txnStatus: Object.fromEntries((lk.txnStatus ?? []).map(t => [s(t.code), s(t.text)])),
    mcs: mcRows.map(m => mcFromRow(m, models)).filter(m => m.mc),
    // Open for assignment: not cancelled (30) and not a short-straddle Deal ID (its own release path).
    deals: dealRows.filter(d => s(d.status) !== '30' && s(d.shortStraddle) !== 'X').map(dealFromRow).filter(d => d.dealId),
    warnings, readAt: new Date().toISOString()
  };
}

/** Created: 01 (and corrections still with FO: 04, 06). Reversed: 02, 05 or the reversed flag. Released: 03 and 07 onwards. */
export function statusOf(code: string, reversed: boolean): Status {
  if (reversed || code === '02' || code === '05') return 'Reversed';
  if (code === '03' || Number(code) >= 7) return 'Released';
  return 'Created';
}

export function rowFromTxn(r: Row, bpNames: Record<string, string>): BlotterRow {
  const code = s(r.transactionType);
  const txnStatus = s(r.txnStatus);
  const partner = s(r.partnerCode);
  const key = TXN_TYPES.find(t => t.type === code)?.key ?? code;
  const fixed = (v: unknown, dp: number) => (s(v) === '' ? '' : n(v).toFixed(dp));
  return {
    id: nextId(), status: statusOf(txnStatus, s(r.reversed) === 'X' || s(r.reversed) === 'true'), touched: true, ref: s(r.rfha), dealId: s(r.dealId),
    tradeDate: day(r.tradeDate), company: s(r.companyCode), bank: partner, bankName: bpNames[partner] || s(r.partner) || partner, txnType: key,
    bs1: s(r.bs1) === 'Buy' ? 'Buy' : s(r.bs1) === 'Sell' ? 'Sell' : '', cur1: s(r.curr1), amount1: fixed(r.amount1, 2), cur2: s(r.curr2),
    rate: fixed(r.allInRate, 6), swap: fixed(r.swapRate, 6), valueDate: day(r.valueDate), mode: '', accCat: '', profit: '', unit: '',
    fixDate: day(r.ndfFixDate), fixRef: s(r.ndfRef), mc: s(r.mcRef), dealType: s(r.dealType), txnStatus, statusText: s(r.statusText), trader: s(r.trader)
  };
}

/** The transactions of one blotter date (SAP, through the report), optionally only those of the given trader codes. */
export async function loadBlotterRows(date: string, traders: string[] | null, bpNames: Record<string, string>, signal?: AbortSignal): Promise<BlotterRow[]> {
  const result = await reportRun('tsf-deals', { selection: { blotterDate: date, blotterTo: date } }, signal);
  return result.rows.filter(r => !traders || traders.includes(s(r.trader))).map(r => rowFromTxn(r, bpNames));
}
