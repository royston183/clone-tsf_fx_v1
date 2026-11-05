// Server part of the Treasury Overview (spec §6.1): one loader per section, reading the Liquidity Statement and the Cash
// Flow Lines through ctx.report. Limits and RAG are decided here, never from browser input.
import { monthLabel, periodsOf, previousPeriod, quarterLabel, ragOf } from '@/lib/dashboard/periods';
import type { Range, Tile } from '@/lib/dashboard/types';
import type { Row } from '@/lib/grid/types';
import type { DrillTarget, RowStyle } from '@/lib/report/types';
import { isZero, sumAmounts } from '@/lib/report/units';
import type { DashboardContext, DashboardServer } from '@core/server/dashboard-types';
import { BUCKETS } from '../liquidity/definition';
import { PRODUCTS } from '../lookups';

/** Tolerance limits of the sample, % of cumulative outflows (a mismatch below −limit is a breach). */
const LIMITS = { b1: 10, b3: 15 } as const;
/** The signed limit both the tile meter and the chart limit line carry: the value at which the limit is reached. */
const limitLine = (limit: number): string => (-limit).toFixed(2);
const LEAVES = ['A:01:01', 'A:01:02', 'A:02:01', 'B:01:01', 'B:01:02'];
type Period = { month: string; year: string };

const byId = (rows: Row[], id: string): Row => rows.find(r => r.id === id) ?? {};
const liquidity = (ctx: DashboardContext, sel: Row, p: Period = sel as Period) => ctx.report('sample-liquidity', { company: sel.company, month: p.month, year: p.year });
const cashflows = (ctx: DashboardContext, sel: Row, p: Period = sel as Period) => ctx.report('sample-cashflow', { company: sel.company, month: p.month, year: p.year });
const filters = (sel: Row) => ({ company: sel.company, month: sel.month, year: sel.year });
const statement = (sel: Row): DrillTarget => ({ kind: 'screen', module: 'sample-liquidity', filters: filters(sel), label: 'Open the Liquidity Statement' });
const flowLines = (sel: Row): DrillTarget => ({ kind: 'screen', module: 'sample-cashflow', filters: filters(sel), label: 'Open the Cash Flow Lines' });
const label = (p: Period, range: Range, ctx: DashboardContext) => (range === '4q' ? quarterLabel(p.month, p.year, ctx.quarterStartMonth) : monthLabel(p.month, p.year));

function delta(now: string | undefined, before: string | undefined): Tile['delta'] {
  if (!now || !before) return undefined;
  const d = Math.round((Number(now) - Number(before)) * 100) / 100;
  return { value: `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(2)} pts vs last month`, good: 'up' };
}

function mismatchTile(name: string, value: string | undefined, before: string | undefined, limit: number, sel: Row, info: string): Tile {
  const change = delta(value, before);
  return {
    label: name, value: value ?? '', type: 'percent', info, drill: statement(sel),
    // The meter carries the value and the signed limit; the tile shows the share of the limit used (0 % while positive).
    ...(value ? { meter: { value, limit: limitLine(limit) }, rag: ragOf(Number(value), limit) } : {}),
    ...(change ? { delta: change } : {})
  };
}

export const treasuryServer: DashboardServer = {
  sections: {
    async kpis(sel, ctx) {
      const [now, before, flows] = await Promise.all([liquidity(ctx, sel), liquidity(ctx, sel, previousPeriod(sel.month, sel.year)), cashflows(ctx, sel)]);
      const e = byId(now, 'E'), eBefore = byId(before, 'E');
      return {
        kind: 'tiles',
        tiles: [
          { label: 'Outflows', value: byId(now, 'A').total ?? '', type: 'amount', currency: 'INR', info: 'All outflow groups of the Liquidity Statement for the period (A).', drill: statement(sel) },
          mismatchTile('Mismatch 1–7 days', e.b1, eBefore.b1, LIMITS.b1, sel, `Cumulative mismatch up to 7 days as % of cumulative outflows. Limit −${LIMITS.b1} %, amber from 80 % of it.`),
          mismatchTile('Mismatch up to 30 days', e.b3, eBefore.b3, LIMITS.b3, sel, `Cumulative mismatch up to 30 days as % of cumulative outflows. Limit −${LIMITS.b3} %, amber from 80 % of it.`),
          { label: 'Cash flow lines', value: String(flows.length), type: 'count', info: 'Cash flow lines of the company code paid in the period.', drill: flowLines(sel) }
        ]
      };
    },
    async gap(sel, ctx, range) {
      const r: Range = range ?? '6m';
      const periods = periodsOf(sel.month, sel.year, r, ctx.quarterStartMonth);
      const all = await Promise.all(periods.map(p => liquidity(ctx, sel, p)));
      const points = periods.map((p, i) => {
        const y = byId(all[i], 'E').b1 ?? '';
        const status = y === '' ? 'green' : ragOf(Number(y), LIMITS.b1);
        return { x: label(p, r, ctx), y, ...(status === 'green' ? {} : { status }) };
      });
      return { kind: 'series', format: 'percent', range: r, series: [{ name: '1–7 days', points, limit: limitLine(LIMITS.b1) }] };
    },
    async flows(sel, ctx, range) {
      const r: Range = range ?? '6m';
      const periods = periodsOf(sel.month, sel.year, r, ctx.quarterStartMonth);
      const all = await Promise.all(periods.map(p => cashflows(ctx, sel, p)));
      const total = (rows: Row[], type: string) => sumAmounts(rows.filter(f => f.currency === 'INR' && f.flowType === type).map(f => f.amount));
      return {
        kind: 'series', format: 'amount', currency: 'INR', range: r,
        series: [
          { name: 'Interest', points: periods.map((p, i) => ({ x: label(p, r, ctx), y: total(all[i], 'INT') })) },
          { name: 'Repayment', points: periods.map((p, i) => ({ x: label(p, r, ctx), y: total(all[i], 'REP') })) }
        ]
      };
    },
    async mix(sel, ctx) {
      const rows = (await cashflows(ctx, sel)).filter(f => f.currency === 'INR');
      const slices = PRODUCTS.map(p => ({ label: p.label, value: sumAmounts(rows.filter(f => f.product === p.value).map(f => f.amount)) })).filter(s => !isZero(s.value));
      return { kind: 'slices', currency: 'INR', slices };
    },
    async summary(sel, ctx) {
      const rows = await liquidity(ctx, sel);
      const columns = [...BUCKETS.map(b => ({ id: b.id, label: b.label })), { id: 'total', label: 'Total' }];
      const line = (id: string, text: string, style?: RowStyle) => ({ label: text, ...(style ? { style } : {}), cells: Object.fromEntries(columns.map(c => [c.id, byId(rows, id)[c.id] ?? ''])) });
      return {
        kind: 'table', columns,
        rows: [line('A', 'A. Outflows'), line('B', 'B. Inflows'), line('C', 'C. Mismatch (B − A)', 'warn'), line('E', 'E. Cumulative mismatch %', 'percent')],
        drill: Object.fromEntries(BUCKETS.map(b => [b.id, {
          lines: LEAVES.map(id => byId(rows, id)).filter(r => !isZero(r[b.id])).map(r => ({ label: r.name ?? '', amount: r[b.id] ?? '' })),
          target: statement(sel)
        }]))
      };
    }
  },
  async chips(sel, ctx) {
    const [rows, flows] = await Promise.all([liquidity(ctx, sel), cashflows(ctx, sel)]);
    return [
      { label: `Liquidity Statement: ${rows.length} rows`, tone: rows.length ? 'saved' : 'off' },
      { label: `Cash flows: ${flows.length} lines`, tone: flows.length ? 'saved' : 'off' }
    ];
  }
};
