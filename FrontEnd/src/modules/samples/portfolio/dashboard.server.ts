// Server part of the portfolio sample (spec §6.1), which shows every dashboard part: every section from the portfolio's
// deals (ctx.rows, sample data), filtered by the company code scope and active on the key date. It is a pattern for an
// Overview's parts, never an Overview to copy or adapt; an application's own Overview reads its own modules the same way
// (ctx.rows, ctx.count, ctx.report).
import type { BarItem, Entity, FlowStep, SharePart, Tile } from '@/lib/dashboard/types';
import type { Row } from '@/lib/grid/types';
import type { ListFilter } from '@/lib/list/types';
import type { DrillTarget } from '@/lib/report/types';
import { sumAmounts } from '@/lib/report/units';
import { MODULES } from '@/modules/registry';
import type { DashboardContext, DashboardServer } from '@core/server/dashboard-types';
import { COLLATERAL, COMPANIES, COUNTERPARTIES, PRODUCTS, STAGES } from './seed';

const CURRENCY = 'INR';
/** The deals list the cards open (the Deals sample, while the template's samples are registered). */
const DEALS = 'sample-deals';
const open = (filters: Record<string, string>, label: string): DrillTarget | undefined =>
  (Object.hasOwn(MODULES, DEALS) ? { kind: 'screen', module: DEALS, filters, label } : undefined);

/** The deals of the selection: its company code (all when blank), active on the key date. */
async function dealsOf(sel: Row, ctx: DashboardContext): Promise<Row[]> {
  const filters: ListFilter[] = sel.company ? [{ field: 'company', op: 'eq', values: [sel.company] }] : [];
  const rows = await ctx.rows('sample-portfolio', 'deals', filters);
  return rows.filter(r => !sel.keyDate || (r.start <= sel.keyDate && sel.keyDate <= r.end));
}
const total = (rows: Row[], field = 'amount') => sumAmounts(rows.map(r => r[field] ?? '0'));
const ratio = (a: string, b: string, digits = 1) => (Number(b) ? ((Number(a) / Number(b)) * 100).toFixed(digits) : '0.0');
const groups = (rows: Row[], field: string) => {
  const by = new Map<string, Row[]>();
  for (const r of rows) by.set(r[field], [...(by.get(r[field]) ?? []), r]);
  return [...by];
};
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const byAmount = (a: BarItem, b: BarItem) => Number(b.value) - Number(a.value);

export const portfolioServer: DashboardServer = {
  sections: {
    async companies(sel, ctx) {
      const rows = await ctx.rows('sample-portfolio', 'deals');
      const active = rows.filter(r => !sel.keyDate || (r.start <= sel.keyDate && sel.keyDate <= r.end));
      const entities: Entity[] = COMPANIES.filter(c => !sel.company || c.CODE === sel.company).map(c => {
        const mine = active.filter(r => r.company === c.CODE);
        return {
          code: c.CODE, name: c.TEXT, amount: total(mine), label: 'Outstanding',
          stats: [
            { label: 'Deals', value: String(mine.length) }, { label: 'Counterparties', value: String(new Set(mine.map(r => r.counterparty)).size) },
            { label: 'Payments due', value: String(mine.filter(r => r.stage === 'due').length) }, { label: 'Overdue', value: String(mine.filter(r => Number(r.dpd) > 0).length) }
          ],
          drill: open({}, 'Open the deals')
        };
      });
      return { kind: 'entities', entities, currency: CURRENCY };
    },
    async kpis(sel, ctx) {
      const rows = await dealsOf(sel, ctx);
      const outstanding = total(rows), limit = total(rows, 'limit'), market = total(rows, 'market');
      const overdue = rows.filter(r => Number(r.dpd) > 0);
      const used = ratio(outstanding, limit);
      const tiles: Tile[] = [
        { label: 'Total outstanding', value: outstanding, type: 'amount', currency: CURRENCY, icon: 'treasury', note: `Principal plus accrued interest · ${used}% of the sanctioned limit` },
        { label: 'Active deals', value: String(rows.length), type: 'count', icon: 'deals', note: `${plural(new Set(rows.map(r => r.counterparty)).size, 'counterparty', 'counterparties')} · ${plural(rows.filter(r => r.stage === 'settlement').length, 'settlement')} this month` },
        { label: 'Limit utilisation', value: used, type: 'percent', icon: 'limits', meter: { value: used, limit: '80.00' }, rag: Number(used) > 80 ? 'red' : Number(used) > 64 ? 'amber' : 'green', note: 'Policy limit 80.0 % of the sanctioned limit' },
        { label: 'Overdue', value: ratio(total(overdue), outstanding), type: 'percent', icon: 'schedule', note: `${plural(overdue.length, 'deal')} past due` },
        { label: 'Collateral coverage', value: Number(outstanding) ? (Number(market) / Number(outstanding)).toFixed(2) : '0.00', type: 'ratio', icon: 'collateral', note: 'Pledged collateral at market value against the outstanding' }
      ];
      return { kind: 'tiles', tiles };
    },
    async lifecycle(sel, ctx) {
      const rows = await dealsOf(sel, ctx);
      const steps: FlowStep[] = STAGES.map(stage => {
        const mine = rows.filter(r => r.stage === stage.id);
        return {
          label: stage.label, title: plural(mine.length, stage.noun.replace(/s$/, ''), stage.noun), note: stage.note, amount: total(mine), tone: stage.id === 'due' ? 'amber' : 'blue',
          drill: open({}, `Open the ${stage.label.toLowerCase()} list`),
          items: stage.states.map(([name, tag]) => { const these = mine.filter(r => r.state === name); return { name, tag, amount: total(these), badge: String(these.length) }; }).filter(i => i.badge !== '0')
        };
      });
      return { kind: 'steps', root: { label: 'Portfolio', title: 'Treasury deals', amount: total(rows, 'limit'), drill: open({}, 'Open the deals') }, steps, currency: CURRENCY };
    },
    async products(sel, ctx) {
      const rows = await dealsOf(sel, ctx);
      const items = groups(rows, 'product').map(([code, mine]) => ({ label: `${code} · ${PRODUCTS[code] ?? code}`, note: plural(mine.length, 'deal'), value: total(mine), drill: open({}, 'Open the deals') }));
      return { kind: 'items', items: items.sort(byAmount), currency: CURRENCY };
    },
    async ageing(sel, ctx) {
      const rows = await dealsOf(sel, ctx);
      const band = (label: string, tone: SharePart['tone'], from: number, to: number): SharePart => {
        const mine = rows.filter(r => Number(r.dpd) >= from && Number(r.dpd) <= to);
        return { label, value: total(mine), count: plural(mine.length, 'deal'), tone };
      };
      return {
        kind: 'shares', currency: CURRENCY,
        parts: [band('Current', 'green', 0, 0), band('1–30 days', 'blue', 1, 30), band('31–60 days', 'amber', 31, 60), band('61–90 days', 'orange', 61, 90), band('Over 90 days', 'red', 91, 99999)]
      };
    },
    async counterparties(sel, ctx) {
      const rows = await dealsOf(sel, ctx);
      const items = groups(rows, 'counterparty').map(([code, mine]) => ({ label: COUNTERPARTIES[code] ?? code, note: plural(mine.length, 'deal'), value: total(mine) }));
      return { kind: 'items', items: items.sort(byAmount).slice(0, 5), currency: CURRENCY };
    },
    async collateral(sel, ctx) {
      const rows = await dealsOf(sel, ctx);
      const slices = groups(rows, 'collateral').map(([code, mine]) => ({ label: COLLATERAL[code] ?? code, value: total(mine, 'market'), values: { market: total(mine, 'market'), eligible: total(mine, 'eligible') } }));
      return { kind: 'slices', slices: slices.sort((a, b) => Number(b.value) - Number(a.value)), currency: CURRENCY };
    },
    async summary(sel, ctx) {
      const rows = await dealsOf(sel, ctx);
      const outstanding = total(rows);
      const line = (label: string, sub: string, mine: Row[], style?: 'total') => ({
        label, sub, ...(style ? { style } : {}),
        cells: { deals: String(mine.length), limit: total(mine, 'limit'), outstanding: total(mine), share: ratio(total(mine), outstanding, 2), collateral: total(mine, 'market'), ltv: ratio(total(mine), total(mine, 'market'), 2) }
      });
      return {
        kind: 'table', currency: CURRENCY, rowHeader: 'Product',
        columns: [
          { id: 'deals', label: 'Deals', format: 'count' }, { id: 'limit', label: 'Sanctioned limit' }, { id: 'outstanding', label: 'Outstanding' }, { id: 'share', label: 'Share', format: 'percent' },
          { id: 'collateral', label: 'Collateral (market)', accent: true }, { id: 'ltv', label: 'LTV', format: 'percent', accent: true }
        ],
        rows: [...groups(rows, 'product').map(([code, mine]) => line(PRODUCTS[code] ?? code, code, mine)), line('Total', '', rows, 'total')],
        footnote: 'Outstanding is principal plus accrued interest on the key date. Collateral is the pledged quantity at the closing price of the key date; LTV is the outstanding over the collateral value.',
        ...(open({}, '') ? { explore: { kind: 'screen' as const, module: DEALS, filters: {}, label: 'Explore the deals' } } : {})
      };
    }
  }
};
