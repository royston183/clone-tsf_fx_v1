// Deterministic liquidity statements: company codes 1000 and 2000 (2000 twice the amounts), every month of 2025 and
// 2026. Leaf groups grow per month; headings, subtotals, the mismatch and its cumulative % follow from them.
import type { Row } from '@/lib/grid/types';
import type { ModuleSeed } from '../../types';

/** Leaf groups: rupees per bucket, and the growth per month since January 2025. */
const LEAVES: Record<string, { base: number[]; step: number[] }> = {
  'A:01:01': { base: [1200000, 800000, 2500000, 4000000, 9000000], step: [10000, 10000, 10000, 10000, 10000] },
  'A:01:02': { base: [0, 0, 500000, 0, 6000000], step: [0, 0, 0, 0, 0] },
  'A:02:01': { base: [0, 0, 0, 0, 0], step: [0, 0, 0, 0, 0] },
  'B:01:01': { base: [600000, 1000000, 2000000, 1500000, 5000000], step: [60000, 0, 0, 0, 0] },
  'B:01:02': { base: [25000, 25000, 50000, 150000, 300000], step: [0, 0, 0, 0, 0] }
};
const BUCKET_IDS = ['b1', 'b2', 'b3', 'b4', 'b5'];
const add = (...xs: number[][]) => xs[0].map((_, i) => xs.reduce((s, x) => s + x[i], 0));
const running = (xs: number[]) => xs.map((_, i) => xs.slice(0, i + 1).reduce((s, x) => s + x, 0));
const money = (n: number) => `${n}.00`;
const sum = (xs: number[]) => money(xs.reduce((s, x) => s + x, 0));

export function liquiditySeed(): ModuleSeed {
  const statement: Row[] = [];
  for (const [company, factor] of [['1000', 1], ['2000', 2]] as const) {
    for (let m = 0; m < 24; m++) {
      const year = String(2025 + Math.floor(m / 12)), month = String((m % 12) + 1).padStart(2, '0');
      const leaf = (id: string) => LEAVES[id].base.map((b, i) => (b + LEAVES[id].step[i] * m) * factor);
      const tl = leaf('A:01:01'), bonds = leaf('A:01:02'), ip = leaf('A:02:01'), fd = leaf('B:01:01'), ir = leaf('B:01:02');
      const a01 = add(tl, bonds), a = add(a01, ip), b = add(fd, ir);
      const c = a.map((v, i) => b[i] - v);
      const d = running(c), cumA = running(a);
      const pct = d.map((v, i) => (cumA[i] ? (Math.round((v * 10000) / cumA[i]) / 100).toFixed(2) : '0.00'));
      let seq = 0;
      const row = (id: string, name: string, rowStyle: string, values: string[], total: string, extra: Row = {}) => {
        statement.push({ company, month, year, seq: String(++seq), id, name, rowStyle, split: '', product: '', ...Object.fromEntries(BUCKET_IDS.map((k, i) => [k, values[i]])), total, ...extra });
      };
      const amounts = (xs: number[]) => xs.map(money);
      row('A', 'A. Outflows', 'HEADING', amounts(a), sum(a));
      row('A:01', 'Borrowings', 'LEVEL1', amounts(a01), sum(a01));
      row('A:01:01', 'Term loans', '', amounts(tl), sum(tl), { product: '51A' });
      row('A:01:02', 'Bonds', '', amounts(bonds), sum(bonds), { product: '53A' });
      row('A:02', 'Other outflows', 'LEVEL1', amounts(ip), sum(ip));
      row('A:02:01', 'Interest payable', '', amounts(ip), sum(ip), { split: 'X' });
      row('AT', 'Total outflows (A)', 'SUBTOTAL', amounts(a), sum(a));
      row('B', 'B. Inflows', 'HEADING', amounts(b), sum(b));
      row('B:01', 'Deposits placed', 'LEVEL1', amounts(b), sum(b));
      row('B:01:01', 'Fixed deposits', '', amounts(fd), sum(fd), { product: '52A' });
      row('B:01:02', 'Interest receivable', '', amounts(ir), sum(ir), { split: 'X' });
      row('BT', 'Total inflows (B)', 'SUBTOTAL', amounts(b), sum(b));
      row('C', 'C. Mismatch (B − A)', 'MISMATCH', amounts(c), sum(c));
      row('D', 'D. Cumulative mismatch', 'TOTAL', amounts(d), '');
      row('E', 'E. Cumulative mismatch % of outflows', 'PERCENT', pct, '');
    }
  }
  return { tables: { statement } };
}
