// Update Price on a date: every commodity with its price for the day picked (or Missing, with the last earlier price),
// and Save as creates / updates with Effective From = that day.
import { describe, expect, it } from 'vitest';
import type { Row } from '@/lib/grid/types';
import { priceOf, savePlan, sheetFigures, sheetFor } from '@/pages/update-price/logic';

const commodities = [
  { commodity: 'C112', description: 'SOYOIL', unit: 'LBS', currency: 'USD' },
  { commodity: 'C110', description: 'RUBBER', unit: 'LBS', currency: 'USD' },
  { commodity: 'ALMOND', description: 'Almonds', unit: 'LBS', currency: 'USD' },
  { commodity: 'C124', description: 'COTTON', unit: 'LBS', currency: 'USD' }
];
// The prices of the screenshot (Price History, 06-11-2026).
const prices: Row[] = [
  { commodity: 'C110', effectiveFrom: '2026-11-06', price: '3.4000', currency: 'USD', __etag: 'W/"1"' },
  { commodity: 'C112', effectiveFrom: '2026-11-06T00:00:00Z', price: '3.1500', currency: 'USD', __etag: 'W/"2"' },
  { commodity: 'ALMOND', effectiveFrom: '2026-11-05', price: '2.1500', currency: 'USD' },
  { commodity: 'C110', effectiveFrom: '2026-11-04', price: '98.0000', currency: 'USD' }
];

describe('the commodities on a date', () => {
  it('lists every commodity: its price for the day, or Missing with the last earlier price', () => {
    const lines = sheetFor('2026-11-06', commodities, prices);
    expect(lines.map(l => [l.commodity, l.status, l.onDate?.price ?? '', l.last?.price ?? ''])).toEqual([
      ['ALMOND', 'Missing', '', '2.1500'],
      ['C110', 'Set', '3.4000', '98.0000'],
      ['C112', 'Set', '3.1500', ''],
      ['C124', 'Missing', '', '']
    ]);
    expect(sheetFigures(lines)).toEqual({ total: 4, set: 2, missing: 2 });
  });
  it('a later day has every commodity Missing, with the latest prices as hints', () => {
    const lines = sheetFor('2026-11-07', commodities, prices);
    expect(lines.filter(l => l.status === 'Set')).toEqual([]);
    expect(lines.find(l => l.commodity === 'C110')?.last?.price).toBe('3.4000');
  });
  it('an earlier day ignores the prices after it', () => {
    expect(sheetFor('2026-11-05', commodities, prices).find(l => l.commodity === 'C110')).toMatchObject({ status: 'Missing', last: { effectiveFrom: '2026-11-04' } });
  });
});

describe('Save for the day', () => {
  const lines = sheetFor('2026-11-06', commodities, prices);
  it('creates the Missing ones given a price and updates the changed Set ones (with their ETag)', () => {
    const plan = savePlan('2026-11-06', lines, { ALMOND: '2.2', C110: '3.4000', C112: '3.2', C124: '' });
    expect(plan.problems).toEqual([]);
    expect(plan.creates).toEqual([{ commodity: 'ALMOND', effectiveFrom: '2026-11-06', price: '2.2000', currency: 'USD' }]);
    expect(plan.updates).toEqual([{ ...prices[1], price: '3.2000' }]);
  });
  it('refuses a price that is not above zero or has more than 4 decimals', () => {
    expect(priceOf('0')).toBeNull();
    expect(priceOf('-1')).toBeNull();
    expect(priceOf('1.23456')).toBeNull();
    expect(priceOf('abc')).toBeNull();
    expect(priceOf(' 1,234.5 ')).toBe('1234.5000');
    expect(savePlan('2026-11-06', lines, { ALMOND: '0' }).problems[0].message).toMatch(/ALMOND: the price must be a number above zero/);
  });
  it('sends nothing without a date or without changes', () => {
    expect(savePlan('', lines, { ALMOND: '1' }).problems[0].message).toBe('Pick a date first.');
    expect(savePlan('2026-11-06', lines, {})).toEqual({ creates: [], updates: [], problems: [] });
  });
});
