// Section loaders of the TSF FX Overview: the master contracts (ctx.rows) and the TSF deal lines (ctx.report) of this
// application, filtered by the company scope and the key date. Every figure is worked out from those rows.
import type { BarItem, FlowStep, Slice, Tile } from '@/lib/dashboard/types';
import { formatDate } from '@/lib/fields/parse';
import type { Row } from '@/lib/grid/types';
import { sumAmounts } from '@/lib/report/units';
import type { DashboardContext, DashboardServer } from '@core/server/dashboard-types';
import { ORIGINS, mcStatusText, modelOf } from '../master-contract/lookups';

const MC = 'master-contract', DEALS = 'tsf-deals', CURRENCY = 'USD';
const minus = (iso: string, days: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - days); return d.toISOString().slice(0, 10); };
const plus = (iso: string, days: number) => minus(iso, -days);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Master contracts of the scope: a company code maps to the origin entities registered in it. */
async function contracts(sel: Row, ctx: DashboardContext): Promise<Row[]> {
  const rows = await ctx.rows(MC, 'contracts');
  const origins = sel.company ? ORIGINS.filter(o => o.company === sel.company).map(o => o.value) : null;
  return rows.filter(r => !origins || origins.includes(r.origin));
}
/** Deal lines blotted in the 60 days to the key date, of the company code when one is chosen, without reversals. */
async function deals(sel: Row, ctx: DashboardContext): Promise<Row[]> {
  const rows = await ctx.report(DEALS, { blotterDate: minus(sel.keyDate, 60), blotterTo: sel.keyDate, ...(sel.company ? { companyCode: sel.company } : {}) });
  return rows.filter(r => r.reversed !== 'X');
}
const usd = (rows: Row[]) => sumAmounts(rows.map(r => (r.curr1 === 'USD' ? r.amount1 : r.curr2 === 'USD' ? r.amount2 : '0') || '0'));
const value = (rows: Row[]) => sumAmounts(rows.map(r => r.amountUsd || '0'));

export const fxOverviewServer: DashboardServer = {
  sections: {
    async kpis(sel, ctx) {
      const [mcs, lines] = await Promise.all([contracts(sel, ctx), deals(sel, ctx)]);
      const open = lines.filter(r => r.valueDate >= sel.keyDate && r.txnStatus !== '30');
      const maturing = open.filter(r => r.valueDate <= plus(sel.keyDate, 30));
      const live = mcs.filter(r => ['03', '04'].includes(r.status));
      const waiting = mcs.filter(r => ['02', '13'].includes(r.status));
      const tiles: Tile[] = [
        { label: 'TSF deal lines', value: String(lines.length), type: 'count', icon: 'deals', note: `${plural(new Set(lines.map(r => r.dealId)).size, 'Deal ID')} · last 60 days`, drill: { kind: 'screen', module: DEALS, filters: {}, label: 'Open the TSF deals' } },
        { label: 'Open USD notional', value: usd(open), type: 'amount', currency: CURRENCY, icon: 'treasury', note: `${plural(open.length, 'line')} not yet at value date` },
        { label: 'Maturing in 30 days', value: usd(maturing), type: 'amount', currency: CURRENCY, icon: 'schedule', note: plural(maturing.length, 'deal line'), ...(maturing.length ? { tag: { label: 'Due soon', tone: 'amber' as const } } : {}) },
        { label: 'Master contract value', value: value(live), type: 'amount', currency: CURRENCY, icon: 'facilities', note: `${plural(live.length, 'contract')} confirmed or in use`, drill: { kind: 'screen', module: MC, filters: { status: '03' }, label: 'Open the confirmed contracts' } },
        { label: 'Awaiting MO confirmation', value: String(waiting.length), type: 'count', icon: 'approvals', note: 'Released to M.O. or corrected by FO', ...(waiting.length ? { tag: { label: 'Action needed', tone: 'amber' as const } } : { tag: { label: 'Clear', tone: 'green' as const } }), drill: { kind: 'screen', module: MC, filters: { status: '02' }, label: 'Open the released contracts' } }
      ];
      return { kind: 'tiles', tiles };
    },
    async mcLifecycle(sel, ctx) {
      const mcs = await contracts(sel, ctx);
      const stage = (label: string, codes: string[], note: string, tone: FlowStep['tone']): FlowStep => {
        const mine = mcs.filter(r => codes.includes(r.status));
        return {
          label, title: plural(mine.length, 'contract'), note, amount: value(mine), tone,
          drill: { kind: 'screen', module: MC, filters: { status: codes[0] }, label: `Open ${label.toLowerCase()}` },
          items: codes.map(c => { const these = mine.filter(r => r.status === c); return { name: mcStatusText(c), amount: value(these), badge: String(these.length) }; }).filter(i => i.badge !== '0')
        };
      };
      return {
        kind: 'steps', currency: CURRENCY,
        root: { label: 'Master contracts', title: plural(mcs.length, 'contract'), amount: value(mcs), drill: { kind: 'screen', module: MC, filters: {}, label: 'Open the master contracts' } },
        steps: [
          stage('Created by FO', ['01', '11'], 'New, or returned by MO for correction', 'amber'),
          stage('With MO', ['02', '13'], 'Waiting for MO confirmation', 'blue'),
          stage('Confirmed', ['03'], 'Ready for Deal IDs', 'green'),
          stage('In use', ['04'], 'Linked to a Deal ID', 'green'),
          stage('Closed', ['09', '12'], 'Expired or reversed', 'red')
        ]
      };
    },
    async dealStatus(sel, ctx) {
      const lines = await deals(sel, ctx);
      const by = new Map<string, Row[]>();
      for (const r of lines) by.set(String(r.statusText), [...(by.get(String(r.statusText)) ?? []), r]);
      const slices: Slice[] = [...by].map(([label, rows]) => ({ label, value: usd(rows) }));
      return { kind: 'slices', slices: slices.sort((a, b) => Number(b.value) - Number(a.value)), currency: CURRENCY };
    },
    async byModel(sel, ctx) {
      const mcs = (await contracts(sel, ctx)).filter(r => ['03', '04'].includes(r.status));
      const by = new Map<string, Row[]>();
      for (const r of mcs) by.set(String(r.model), [...(by.get(String(r.model)) ?? []), r]);
      const items: BarItem[] = [...by].map(([m, rows]) => ({ label: `${m} · ${modelOf(m)?.text ?? m}`, note: plural(rows.length, 'contract'), value: value(rows), drill: { kind: 'screen', module: MC, filters: { model: m }, label: `Open ${m} contracts` } }));
      return { kind: 'items', items: items.sort((a, b) => Number(b.value) - Number(a.value)), currency: CURRENCY };
    },
    async maturities(sel, ctx) {
      const lines = (await deals(sel, ctx)).filter(r => r.valueDate >= sel.keyDate && r.txnStatus !== '30').sort((a, b) => a.valueDate.localeCompare(b.valueDate)).slice(0, 8);
      return {
        kind: 'table', currency: CURRENCY, rowHeader: 'Transaction',
        columns: [
          { id: 'valueDate', label: 'Value date', format: 'text' }, { id: 'company', label: 'Company', format: 'text' }, { id: 'pair', label: 'Pair', format: 'text' },
          { id: 'amount', label: 'Amount (USD)' }, { id: 'rate', label: 'All-in rate', format: 'text' }, { id: 'status', label: 'Status', format: 'text' }
        ],
        rows: lines.map(r => ({
          label: r.rfha, sub: `${r.dealId} · ${r.partner}`,
          cells: { valueDate: formatDate(r.valueDate), company: r.companyCode, pair: `${r.curr1}/${r.curr2}`, amount: usd([r]), rate: Number(r.allInRate).toFixed(4), status: r.statusText }
        })),
        footnote: `The next ${plural(lines.length, 'deal line')} by value date; the status is the TSF workflow status of the transaction.`,
        explore: { kind: 'screen', module: DEALS, filters: {}, label: 'Explore the TSF deals' }
      };
    }
  }
};
