// The live queue of TSF MO Deal Confirmation: the `tsf-deals` report (ZFS_SB_TSFDEAL_O4_API) read once per MO status, and
// the Deal IDs' over-utilisation flag from `tsf-deal-id` (ZSGTSFTR_DEALID on the middleware, through the BackEnd).
import { moduleQuery, reportRun } from '@/lib/client/data';
import type { Row } from '@/lib/grid/types';
import type { ListPage } from '@/lib/list/types';
import type { ReportResult } from '@/lib/report/types';
import { traderText, type ConfDeal } from './data';

/** The statuses the MO queue shows: FO -> MO Unmatched, MO -> FO Correction Required, FO Corrected. */
export const QUEUE_STATUSES = ['03', '04', '06'] as const;
/** The blotter date the legacy selection starts from. */
export const QUEUE_FROM = '2000-01-01';
export const OPTIONS_EMPTY = 'Option deals have no SAP service yet, so there is nothing to show here. FX deals are shown with Display Type FX.';

export interface QueueSelection { from: string; to: string; upto: string; trader: string }
export interface Queue { deals: ConfDeal[]; /** Why the over-limit check could not run (the queue is still complete). */ warning: string }

/** The functions the queue reads through; the data client by default, a fake in tests. */
export interface QueueIo {
  report(selection: Row): Promise<Pick<ReportResult, 'rows'>>;
  dealIds(dealIds: string[]): Promise<ListPage>;
}
export const liveQueueIo: QueueIo = {
  report: selection => reportRun('tsf-deals', { selection }),
  dealIds: dealIds => moduleQuery('tsf-deal-id', 'dealIds', { filters: [{ field: 'dealId', op: 'in', values: dealIds }], page: 1, pageSize: 500 })
};

const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const str = (v: unknown): string => (v == null ? '' : String(v));
const isReversed = (r: Row) => r.reversed === 'X' || r.reversed === 'true';

/** One report row as the page's deal. The report has no group, profit center, business area, NDF settlement or cash fields: they stay empty. */
export function toConfDeal(r: Row): ConfDeal {
  return {
    key: `${r.companyCode}-${r.rfha}`, dealId: str(r.dealId), companyCode: str(r.companyCode), transaction: str(r.rfha), partner: str(r.partner),
    txnType: str(r.transactionType), tradeDate: str(r.tradeDate), bs1: r.bs1 === 'Sell' ? 'Sell' : 'Buy', curr1: str(r.curr1), amount1: num(r.amount1),
    curr2: str(r.curr2), amount2: num(r.amount2), fixingDate: str(r.ndfFixDate) || str(r.valueDate), valueDate: str(r.valueDate), rate: num(r.allInRate),
    status: str(r.txnStatus), trader: r.trader ? traderText(str(r.trader)) : '', group: '', profitCenter: '', businessArea: '', product: str(r.productType), display: 'FX',
    foRemark: str(r.foRemark) || str(r.ndfFoRemark), moRemark: str(r.moRemark) || str(r.ndfMoRemark), extRef: '', intRef: str(r.intRef)
  };
}

/** The Deal IDs (of the queue) that are over their limit, read 50 at a time. */
async function overLimitIds(io: QueueIo, dealIds: string[]): Promise<Set<string>> {
  const over = new Set<string>();
  for (let i = 0; i < dealIds.length; i += 50) {
    const page = await io.dealIds(dealIds.slice(i, i + 50));
    for (const row of page.rows) if (row.overUtil === 'X' && row.dealId) over.add(str(row.dealId));
  }
  return over;
}

/**
 * The queue: FX deals with status 03, 04 or 06, blotter date from 2000-01-01 up to the chosen day, in the chosen company
 * range and of the chosen trader; reversed deals left out. A single company (or none) goes to SAP as the filter, a range is
 * cut here (the report takes one company code).
 */
export async function loadQueue(sel: QueueSelection, io: QueueIo = liveQueueIo): Promise<Queue> {
  const single = sel.from && (!sel.to || sel.to === sel.from) ? sel.from : '';
  const results = await Promise.all(QUEUE_STATUSES.map(status => io.report({
    blotterDate: QUEUE_FROM, blotterTo: sel.upto, txnStatus: status, ...(single ? { companyCode: single } : {}), ...(sel.trader ? { trader: sel.trader } : {})
  })));
  const rows = results.flatMap(r => r.rows).filter(r => !isReversed(r) && (QUEUE_STATUSES as readonly string[]).includes(str(r.txnStatus))
    && (single || ((!sel.from || str(r.companyCode) >= sel.from) && (!sel.to || str(r.companyCode) <= sel.to))));
  const deals = rows.map(toConfDeal);
  const ids = [...new Set(deals.map(d => d.dealId).filter(Boolean))];
  let warning = '';
  if (ids.length) {
    try {
      const over = await overLimitIds(io, ids);
      for (const d of deals) if (over.has(d.dealId)) d.overLimit = true;
    } catch (e) {
      warning = `The over-limit check could not run: ${e instanceof Error ? e.message : 'try again'}.`;
    }
  }
  return { deals, warning };
}
