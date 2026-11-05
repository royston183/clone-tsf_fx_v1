// Deterministic cash flow lines of the sample deals (Park–Miller generator, no Math.random): 20 lines per company code
// and month of 2025 and 2026; the first line of each is a USD deal, so every selection shows two currencies. Lines 6–7
// of every 8 are repayment instalments (5 % of the principal), so both company codes have repayments in every month.
import type { Row } from '@/lib/grid/types';
import type { ModuleSeed } from '../../types';
import { FLOW_TYPES } from '../deals/definition';
import { dealsSeed } from '../deals/seed';
import { COUNTERPARTIES, PRODUCTS } from '../lookups';

const after = (label: string) => label.slice(label.indexOf(' ') + 1);

export function cashflowSeed(): ModuleSeed {
  const deals = dealsSeed().tables.deals;
  const usd = deals.filter(d => d.currency === 'USD');
  let s = 20261013;
  const next = () => (s = (s * 48271) % 2147483647) / 2147483647;
  const flows: Row[] = [];
  for (let m = 0; m < 24; m++) {
    const year = String(2025 + Math.floor(m / 12)), month = String((m % 12) + 1).padStart(2, '0');
    for (let k = 0; k < 40; k++) {
      const pool = k < 2 ? usd : deals;
      const d = pool[Math.floor(next() * pool.length)];
      const flowType = k % 8 >= 6 ? 'REP' : 'INT';
      flows.push({
        company: k % 2 ? '2000' : '1000', month, year, deal: d.deal,
        counterparty: d.counterparty, cpName: COUNTERPARTIES.find(c => c.CODE === d.counterparty)?.TEXT ?? '',
        product: d.product, productText: after(PRODUCTS.find(p => p.value === d.product)?.label ?? d.product),
        flowType, flowText: after(FLOW_TYPES.find(t => t.value === flowType)?.label ?? flowType),
        payDate: `${year}-${month}-${String(1 + (k % 28)).padStart(2, '0')}`,
        amount: `${Math.round(Number(d.amount) * (flowType === 'REP' ? 0.05 : 0.0075))}.00`, currency: d.currency
      });
    }
  }
  return { tables: { flows } };
}
