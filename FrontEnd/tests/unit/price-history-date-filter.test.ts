// Update Price → Price History: the Effective Date filter replaces the commodity dropdown. A price shows only when its
// Effective From is the day picked; clearing the date shows every price again.
import { describe, expect, it } from 'vitest';
import { freshUi, isoDay, visibleRows } from '@/lib/grid/grid';
import { commodityPrice } from '@/modules/commodity-price/definition';

const tab = commodityPrice.tabs[0];
const rows = [
  { commodity: 'C110', commodityText: 'RUBBER', effectiveFrom: '2026-11-06', price: '3.4000', currency: 'USD', unit: 'LBS' },
  { commodity: 'C112', commodityText: 'SOYOIL', effectiveFrom: '2026-11-06T00:00:00Z', price: '3.1500', currency: 'USD', unit: 'LBS' },
  { commodity: 'C112', commodityText: 'SOYOIL', effectiveFrom: '2026-11-05', price: '3.1000', currency: 'USD', unit: 'LBS' },
  { commodity: 'ALMOND', commodityText: 'Almonds', effectiveFrom: '20261104', price: '2.1500', currency: 'USD', unit: 'LBS' }
];

describe('isoDay', () => {
  it('reads the calendar day of every stored form without a time-zone shift', () => {
    expect(isoDay('2026-11-06')).toBe('2026-11-06');
    expect(isoDay('2026-11-06T23:30:00-05:00')).toBe('2026-11-06');
    expect(isoDay('20261106')).toBe('2026-11-06');
    expect(isoDay('06-11-2026')).toBe('2026-11-06');
    expect(isoDay('')).toBe('');
    expect(isoDay('not a date')).toBe('');
  });
});

describe('Price History: Effective Date filter', () => {
  it('replaces the All Commodities dropdown with an Effective Date picker', () => {
    expect(tab.filters.map(f => [f.id, f.kind, f.all])).toEqual([['effectiveFrom', 'date', 'Effective Date']]);
  });
  it('06-11-2026 shows only the prices effective from that day', () => {
    const shown = visibleRows(tab, rows, { ...freshUi(tab), filters: { effectiveFrom: '2026-11-06' } });
    expect(shown.map(r => `${r.commodity} ${r.effectiveFrom}`).sort()).toEqual(['C110 2026-11-06', 'C112 2026-11-06T00:00:00Z']);
  });
  it('a day with no price shows nothing; clearing the date shows every price again', () => {
    expect(visibleRows(tab, rows, { ...freshUi(tab), filters: { effectiveFrom: '2026-11-07' } })).toEqual([]);
    expect(visibleRows(tab, rows, { ...freshUi(tab), filters: { effectiveFrom: '' } })).toHaveLength(4);
  });
  it('works together with the search box', () => {
    const shown = visibleRows(tab, rows, { ...freshUi(tab), search: 'rubber', filters: { effectiveFrom: '2026-11-06' } });
    expect(shown.map(r => r.commodity)).toEqual(['C110']);
  });
});
