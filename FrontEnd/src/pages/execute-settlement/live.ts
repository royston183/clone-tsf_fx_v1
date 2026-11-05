// Reads of the MO Execute Settlement screen: only through the data client (lib/client/data.ts).
//   tsf-deal-id (rest)      the Deal ID record and the picker          master-contract (rest)   MC description, date, ship end
//   tsf-deals (SAP report)  the FX legs of the Deal ID                 trm-fx-app (SAP)         settled flag and stored bank fields of the legs
//   settlement-data (rest)  the model, its settlement configuration, the Deal ID's invoices, stored trade positions and IN_SPOT rows
import { moduleQuery, moduleView, reportRun } from '@/lib/client/data';
import type { ListFilter } from '@/lib/list/types';
import type { Row } from '@/lib/grid/types';
import type { Deal, DealPick, StatusText } from './data';
import { spaced } from './data';
import { buildFxLegs, buildInvoices, computeDifferences, computeHeadsup } from './logic';

export const SETTLEMENT_DATA = 'settlement-data';
const PAGE = 500;
const eq = (field: string, value: string): ListFilter[] => [{ field, op: 'eq', values: [value] }];
const text = (v: unknown): string => (v === undefined || v === null ? '' : String(v).trim());
export const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Every row of a list, page by page (the BackEnd pages at most 500). */
async function rowsOf(id: string, table: string, filters: ListFilter[] = []): Promise<Row[]> {
  const out: Row[] = [];
  for (let page = 1; ; page++) {
    const got = await moduleQuery(id, table, { page, pageSize: PAGE, filters });
    out.push(...got.rows);
    if (out.length >= got.total || !got.rows.length) return out;
  }
}

/** The Deal IDs of the picker, each with its model's text and entity string. */
export async function loadDealList(): Promise<DealPick[]> {
  const [deals, models] = await Promise.all([rowsOf('tsf-deal-id', 'dealIds'), rowsOf(SETTLEMENT_DATA, 'models')]);
  const model = (id: string) => models.find(m => m.modId === id && !m.linkModel) ?? models.find(m => m.modId === id);
  return deals.map(d => {
    const m = model(text(d.model));
    return { id: text(d.dealId), status: text(d.status), model: text(d.model), modelText: text(m?.modDesc), entity: spaced(text(m?.entDesc)), desc: text(d.dealDesc), mc: text(d.mcRef), end: text(d.endDate) };
  }).sort((a, b) => b.id.localeCompare(a.id));
}

/** The status texts of the Deal ID's type and sub type (ZSGTSFTR_DEAL_ST). */
const statusesOf = (rows: Row[], type: string, sub: string): StatusText[] =>
  rows.filter(r => r.dealType === type && r.subType === sub).map(r => ({ code: text(r.status), text: text(r.text) })).sort((a, b) => a.code.localeCompare(b.code));

/**
 * One Deal ID with everything the screen shows. The Deal ID record itself must read (a missing one is an error); every other read that
 * fails leaves its part empty and says so in `notes`, so an unreadable table is never mistaken for an empty one.
 */
export async function loadDeal(dealId: string): Promise<Deal> {
  const header = (await rowsOf('tsf-deal-id', 'dealIds', eq('dealId', dealId)))[0];
  if (!header) throw new Error(`Deal ID ${dealId} does not exist in ZSGTSFTR_DEALID.`);
  const notes: string[] = [];
  const soft = async <T>(what: string, run: () => Promise<T>, empty: T): Promise<T> => {
    try { return await run(); } catch (e) { notes.push(`${what} could not be read: ${errorText(e)}`); return empty; }
  };

  const mcRef = text(header.mcRef);
  const [lookups, mc] = await Promise.all([
    soft('The status texts and traders', async () => (await moduleView(SETTLEMENT_DATA)).lookups, {} as Record<string, Row[]>),
    soft('The master contract', async () => (mcRef ? (await moduleQuery('master-contract', 'contracts', { page: 1, pageSize: 20, search: mcRef })).rows.find(r => text(r.mcNo) === mcRef) : undefined), undefined as Row | undefined)
  ]);
  const model = text(header.model) || text(mc?.model);
  const byModel = model ? eq('modId', model) : null;
  const none = async (): Promise<Row[]> => [];
  const [rules, setFx, setTyp, billAdj, positions, posting, invRef, setSpt, tsfPay, existing, deals, apps] = await Promise.all([
    soft('The FX model', () => (byModel ? rowsOf(SETTLEMENT_DATA, 'models', byModel) : none()), []),
    soft('The model\'s FX settlement mapping (SET_FX)', () => (byModel ? rowsOf(SETTLEMENT_DATA, 'setFx', byModel) : none()), []),
    soft('The model\'s trade invoice legs (SET_TYP)', () => (byModel ? rowsOf(SETTLEMENT_DATA, 'setTyp', byModel) : none()), []),
    soft('The final invoice values (BIL_ADJ)', () => rowsOf(SETTLEMENT_DATA, 'billAdj', eq('dealId', dealId)), []),
    soft('The stored trade positions (TRD_POS)', () => rowsOf(SETTLEMENT_DATA, 'positions', eq('dealId', dealId)), []),
    soft('The posting types (TRD_ACC)', () => rowsOf(SETTLEMENT_DATA, 'postingTypes'), []),
    soft('The planned trade invoices (INV_REF)', () => rowsOf(SETTLEMENT_DATA, 'invRef', eq('dealId', dealId)), []),
    soft('The spot mapping (SET_SPT)', () => (byModel ? rowsOf(SETTLEMENT_DATA, 'setSpt', byModel) : none()), []),
    soft('The link spot deals (TSF_PAY)', () => (byModel ? rowsOf(SETTLEMENT_DATA, 'tsfPay', byModel) : none()), []),
    soft('The saved invoice differences (IN_SPOT)', () => rowsOf(SETTLEMENT_DATA, 'inSpot', eq('dealId', dealId)), []),
    soft('The FX legs (View List of TSF Deals)', async () => (await reportRun('tsf-deals', { selection: { dealId, blotterDate: '2000-01-01', blotterTo: '2099-12-31' } })).rows, []),
    soft('The settled flags and stored bank fields of the FX legs (TrmFxApp)', () => rowsOf('trm-fx-app', 'apps', eq('ztsfDealID', dealId)), [])
  ]);

  const fx = buildFxLegs(deals, setFx, apps);
  const inv = buildInvoices({ dealId, setTyp, billAdj, positions, posting, fx });
  const rule = rules.find(r => !r.linkModel) ?? rules[0];
  const noInvoice = text(rule?.noInv) === 'X';
  const diffInput = { model, dealId, fx, inv, invRef, billAdj, rules, setSpt, tsfPay, existing };
  const heads = noInvoice ? { rows: [], notice: '' } : computeHeadsup({ model, fx, rules, invRef, billAdj, setTyp });
  const trader = (lookups.traders ?? []).find(t => text(t.code) === text(header.traderCode));
  const dealType = text(header.dealType), subType = text(header.subType);
  const record: Record<string, string> = { ...header };
  delete record.__etag;
  return {
    id: text(header.dealId), dealType, subType, status: text(header.status), etag: text(header.__etag), start: text(header.startDate), end: text(header.endDate),
    revised: text(header.revisedEndDate), mc: mcRef, mcDesc: text(mc?.mcRef), mcDate: text(mc?.mcDate), shipEnd: text(mc?.shipEnd),
    model, modelText: text(rule?.modDesc), entity: spaced(text(rule?.entDesc)), currencies: spaced(text(rule?.currDesc)), noInvoice, trader: text(trader?.trader) || text(trader?.name),
    statuses: statusesOf(lookups.statuses ?? [], dealType, subType), fx, inv, heads: heads.rows, headsNotice: heads.notice,
    diffs: noInvoice ? [] : computeDifferences(diffInput), diffInput, notes, record
  };
}
