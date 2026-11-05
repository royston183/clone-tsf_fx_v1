// src/modules/samples/portfolio/seed.ts
// Deterministic treasury deals of the portfolio sample (every dashboard part on sample data; a pattern for an Overview's
// parts, never an Overview to copy or adapt): the same portfolio on every machine (Park–Miller generator).
import type { Row } from '@/lib/grid/types';
import type { ModuleSeed } from '../../types';

export const COMPANIES = [{ CODE: '1000', TEXT: 'Demo India Ltd' }, { CODE: '2000', TEXT: 'Demo Treasury Ltd' }];
export const PRODUCTS: Record<string, string> = { '60A': 'Term loan', '61A': 'Working capital', '62A': 'Margin funding' };
export const COUNTERPARTIES: Record<string, string> = {
  CP001: 'Axis Finance', CP002: 'Bharat Steel', CP003: 'Coastal Power', CP004: 'Deccan Textiles', CP005: 'Eastern Rail Fund',
  CP006: 'Fortune Housing', CP007: 'Ganga Logistics', CP008: 'Himalaya Agro'
};
export const COLLATERAL: Record<string, string> = { EQ: 'Equity shares', MF: 'Mutual funds', BD: 'Bonds' };
/** The deal lifecycle of the flow chart: each stage and the open states of its deals. */
export const STAGES: { id: string; label: string; noun: string; note: string; states: [string, string][] }[] = [
  { id: 'request', label: 'Request', noun: 'requests', note: 'Awaiting checks', states: [['Verify documents', 'PENDING'], ['Credit check', 'PENDING']] },
  { id: 'approval', label: 'Approval', noun: 'approvals', note: 'Awaiting sign-off', states: [['Credit approval', 'OPEN'], ['Limit missing', 'HOLD']] },
  { id: 'settlement', label: 'Settlement', noun: 'deals', note: 'This month', states: [['Settled', 'POSTED'], ['Awaiting posting', 'OPEN']] },
  { id: 'due', label: 'Payments due', noun: 'payments', note: 'Next 7 days', states: [['Interest', 'DUE'], ['Principal', 'DUE']] },
  { id: 'matured', label: 'Matured', noun: 'deals', note: 'This quarter', states: [['Closed', 'DONE'], ['Unallocated receipts', 'OPEN']] }
];

const day = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export function portfolioSeed(count = 160): ModuleSeed {
  let s = 20261027;
  const next = () => (s = (s * 48271) % 2147483647) / 2147483647;
  function pick<T>(xs: T[]): T { return xs[Math.floor(next() * xs.length)]; }
  const deals: Row[] = [];
  for (let i = 1; i <= count; i++) {
    const product = pick(['60A', '60A', '60A', '61A', '61A', '62A']), stage = STAGES[Math.min(4, Math.floor(next() * next() * 6))];
    const amount = Math.round((Math.floor(next() * 400) + 20) * 100000);
    const dpdRoll = next();
    deals.push({
      company: i % 4 === 0 ? '2000' : '1000', deal: String(300000 + i).padStart(10, '0'), product, counterparty: pick(Object.keys(COUNTERPARTIES)),
      amount: `${amount}.00`, limit: `${Math.round(amount * (1.2 + next() * 0.4))}.00`, collateral: pick(['EQ', 'EQ', 'EQ', 'MF', 'MF', 'BD']),
      market: `${Math.round(amount * (1.6 + next() * 0.6))}.00`, eligible: `${Math.round(amount * (1.1 + next() * 0.3))}.00`,
      dpd: String(dpdRoll < 0.9 ? 0 : dpdRoll < 0.95 ? 15 : dpdRoll < 0.97 ? 45 : dpdRoll < 0.99 ? 75 : 120),
      stage: stage.id, state: pick(stage.states)[0], start: day(2025 + (i % 2), 1 + (i % 12), 1 + (i % 28)), end: day(2028 + (i % 3), 1 + (i % 12), 1 + (i % 28))
    });
  }
  return { tables: { deals }, lookups: {} };
}
