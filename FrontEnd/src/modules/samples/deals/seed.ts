// src/modules/samples/deals/seed.ts
// Deterministic sample deals: the same deals on every machine (Park–Miller generator, no Math.random).
import type { Row } from '@/lib/grid/types';
import type { ModuleSeed } from '../../types';
import { COUNTERPARTIES, PRODUCTS } from '../lookups';

const day = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export function dealsSeed(count = 2000): ModuleSeed {
  let s = 20261012;
  const next = () => (s = (s * 48271) % 2147483647) / 2147483647;
  function pick<T>(xs: T[]): T { return xs[Math.floor(next() * xs.length)]; }
  const deals: Row[] = [], flows: Row[] = [];
  for (let i = 1; i <= count; i++) {
    const deal = String(10000 + i).padStart(10, '0');
    const product = pick(PRODUCTS), cp = pick(COUNTERPARTIES);
    const currency = i % 7 === 0 ? 'USD' : 'INR';
    const amount = `${(Math.floor(next() * 9000) + 100) * 1000}.00`;
    const year = 2024 + (i % 3), month = 1 + (i % 12), date = 1 + (i % 28);
    deals.push({
      deal, name: `${product.label.slice(4)} – ${cp.TEXT}`, product: product.value, counterparty: cp.CODE, amount, currency,
      start: day(year, month, date), end: day(year + 5, month, date), rate: (6 + (i % 40) / 10).toFixed(4), remarks: '', status: i % 5 === 0 ? 'R' : 'N'
    });
    const n = 1 + (i % 3);
    for (let k = 1; k <= n; k++) {
      flows.push({ deal, seq: String(k), payDate: day(year + k, month, date), flowType: k === n ? 'REP' : 'INT', amount: k === n ? amount : `${Math.round(Number(amount) * 0.075)}.00`, currency });
    }
  }
  return { tables: { deals, flows } };
}
