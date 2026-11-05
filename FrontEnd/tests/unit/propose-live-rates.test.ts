import { beforeEach, describe, expect, it, vi } from 'vitest';

const queries: Record<string, Record<string, string>[]> = {
  'tsf-deal-id': [{ dealId: '7000000009', dealDesc: 'INR deal', mcRef: 'M1', dealAmount: '40000.00', dealCurrDesc: 'INR-INR-INR' }],
  'master-contract': [{ mcNo: 'M1', commodity: 'C001', commodityDesc: 'Multiple Commodities' }],
  tradeflow: [{ tfNo: '1', tfDate: '2026-11-05', price: '2.15', currency: 'USD' }]
};
const asked: string[] = [];
vi.mock('@/lib/client/data', () => ({
  moduleQuery: async (id: string) => { await new Promise(r => setTimeout(r, id === 'tsf-deal-id' ? 30 : 0)); return { rows: queries[id] ?? [], total: (queries[id] ?? []).length }; },
  moduleView: async () => ({ tables: { bls: [], commodities: [] } }),
  moduleChange: async () => ({})
}));
vi.mock('@/lib/client/backend-api', () => ({ backendApi: async () => { throw new Error('no AI'); } }));
vi.mock('@/ref/shared/fx/exchange-rate-api', () => ({
  loadExchangeRate: async (from: string, to: string) => { asked.push(`${from}>${to}`); return from === 'INR' && to === 'USD' ? { ExchangeRate: '0.012', NumberOfSourceCurrencyUnits: '1', NumberOfTargetCurrencyUnits: '1' } : null; }
}));

describe('live Propose rates', () => {
  beforeEach(() => { asked.length = 0; });
  it('loads the rate of every deal currency, even when rates are asked before the deals arrive', async () => {
    const { liveProposeData } = await import('@/pages/propose-tradeflows/live');
    const data = liveProposeData();
    const [deals, rates] = await Promise.all([data.deals(), data.rates()]);
    expect(deals[0].currency).toBe('INR');
    expect(rates).toEqual({ INR: '0.012000' });
    expect(asked).toContain('INR>USD');
  });
});
