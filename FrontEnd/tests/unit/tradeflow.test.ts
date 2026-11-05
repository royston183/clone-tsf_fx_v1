import { describe, expect, it } from 'vitest';
import { priceOn, valueOf } from '@/modules/tradeflow/pricing';
import { tradeflow } from '@/modules/tradeflow/definition';
import { tradeflowSeed } from '@/modules/tradeflow/seed';
import { PRICE_ROWS } from '@/modules/commodity-price/seed';
import { MODULES } from '@/modules/registry';

const prices = [
  { commodity: 'ALMOND', effectiveFrom: '2026-10-01', price: '2.10' },
  { commodity: 'ALMOND', effectiveFrom: '2026-11-01', price: '2.15' }
];

describe('trade flow pricing', () => {
  it('takes the latest price on or before the TF date', () => {
    expect(priceOn(prices, 'ALMOND', '2026-10-31')).toBe('2.10');
    expect(priceOn(prices, 'ALMOND', '2026-11-01')).toBe('2.15');
    expect(priceOn(prices, 'ALMOND', '2026-09-30')).toBe('');
    expect(priceOn(prices, 'CASHEW', '2026-11-05')).toBe('');
  });
  it('values exactly to two decimals', () => {
    expect(valueOf('2.15', '264554.93')).toBe('568793.10');
    expect(valueOf('2.1', '44000')).toBe('92400.00');
    expect(valueOf('', '44000')).toBe('');
  });
});

describe('tradeflow module (Tradeflows List)', () => {
  const seed = tradeflowSeed();
  it('is registered, read-only, and opens in a pop-up', () => {
    expect(MODULES.tradeflow).toBe(tradeflow);
    expect(tradeflow.opens).toEqual({ create: 'popup', open: 'popup' });
    expect([tradeflow.canCreate, tradeflow.canEdit, tradeflow.canDelete]).toEqual([false, false, false]);
  });
  it('shows the trade flow, its goods, Price and Value first and the shipment details after them', () => {
    const ids = tradeflow.list.columns.map(c => c.field);
    expect(ids.slice(0, 11)).toEqual(['tfNo', 'tfDate', 'blNo', 'blNumber', 'commodity', 'goods', 'quantity', 'unit', 'price', 'value', 'dealId']);
    expect(ids.slice(11)).toEqual(['notifyParty', 'blDate', 'etd', 'eta', 'contractRef', 'contractDate', 'invoiceRef', 'invoiceDate']);
  });
  it('shows the Deal ID (filled later by Manage Tradeflows) on the list, the record and its Bill of Lading, never in the upload', async () => {
    expect(tradeflow.list.fields.find(f => f.field === 'dealId')).toMatchObject({ label: 'Deal ID', max: 20 });
    expect(tradeflow.header.map(f => f.field)).toContain('dealId');
    const bl = tradeflow.tabs.find(t => t.id === 'bl');
    expect(bl && bl.kind === 'items' ? bl.columns.map(c => c.field) : []).toContain('dealId');
    const { TF_FIELDS } = await import('@/modules/tradeflow/definition');
    expect(TF_FIELDS.map(f => f.field)).not.toContain('dealId');
    expect(seed.tables.tradeflows.every(r => r.dealId === '') && seed.tables.bl.every(r => r.dealId === '')).toBe(true);
  });
  it('filters by TF date, commodity and TF No', () => expect(tradeflow.list.filters).toEqual(['tfDate', 'commodity', 'tfNo']));
  it('shows the Bill of Lading as a read-only tab', () => {
    const bl = tradeflow.tabs.find(t => t.id === 'bl');
    expect(bl).toMatchObject({ kind: 'items', label: 'Bill of Lading', table: 'bl' });
    expect(bl && 'editable' in bl ? bl.editable : undefined).toBeFalsy();
  });
  it('prices every sample trade flow by the rule', () => {
    for (const r of seed.tables.tradeflows) {
      const price = priceOn(PRICE_ROWS, r.commodity, r.tfDate);
      expect(r.price).toBe(price);
      expect(r.value).toBe(valueOf(price, r.quantity));
    }
  });
  it('gives each sample trade flow one BL with the same shipping BL Number', () => {
    for (const r of seed.tables.tradeflows) {
      const bls = seed.tables.bl.filter(b => b.tfNo === r.tfNo && b.tfDate === r.tfDate);
      expect(bls).toHaveLength(1);
      expect(bls[0]).toMatchObject({ blNo: r.blNo, blNumber: r.blNumber, quantity: r.quantity });
    }
  });
  it('treats a price of 0 from SAP (no price on or before the TF date) as no price', () => {
    const price = tradeflow.list.columns.find(c => c.field === 'price');
    const value = tradeflow.list.columns.find(c => c.field === 'value');
    expect(price?.text({ price: '0.0000', currency: '' })).toBe('No price');
    expect(price?.statusTone?.({ price: '0.0000' })).toBe('amber');
    expect(value?.text({ value: '0.00', currency: '' })).toBe('');
    expect(tradeflow.header.find(f => f.field === 'price')?.shown?.({ price: '0.0000' }, {})).toBe('No price');
  });
  it('shows the BL No of a trade flow with one BL and the count when it has several', () => {
    const c = tradeflow.list.columns.find(x => x.field === 'blNo');
    expect(c?.text({ blNo: '4000000012', blCount: '1' })).toBe('4000000012');
    expect(c?.text({ blNo: '', blCount: '3' })).toBe('3 BLs');
    expect(c?.text({ blNo: 'BL00000001' })).toBe('BL00000001');
  });
  it('marks a trade flow without a price amber', () => {
    const price = tradeflow.list.columns.find(c => c.field === 'price');
    expect(price?.statusTone?.({ price: '' })).toBe('amber');
    expect(price?.text({ price: '' })).toBe('No price');
  });
});
