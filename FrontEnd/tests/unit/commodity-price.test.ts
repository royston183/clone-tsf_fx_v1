import { describe, expect, it } from 'vitest';
import { commodityPrice } from '@/modules/commodity-price/definition';
import { commodityPriceSeed } from '@/modules/commodity-price/seed';
import { MODULES } from '@/modules/registry';

const seed = commodityPriceSeed();
const lk = commodityPrice.lookups(seed.lookups);
const tab = commodityPrice.tabs[0];
const ok = { commodity: 'ALMOND', effectiveFrom: '2026-11-05', price: '2.15' };

describe('commodity price module', () => {
  it('is registered and opens in a pop-up', () => {
    expect(MODULES['commodity-price']).toBe(commodityPrice);
    expect(commodityPrice.opens).toEqual({ create: 'popup', open: 'popup' });
    expect(tab.keys).toEqual(['commodity', 'effectiveFrom']);
  });
  it('accepts a positive price for a maintained commodity', () => expect(Object.values(tab.check(ok, lk, 'add')).filter(Boolean)).toEqual([]));
  it('refuses a zero price', () => expect(tab.check({ ...ok, price: '0' }, lk, 'add').price).toBe('Price must be greater than zero.'));
  it('refuses a commodity that is not maintained', () => expect(tab.check({ ...ok, commodity: 'GOLD' }, lk, 'add').commodity).toBe("Commodity 'GOLD' is not maintained."));
  it('shows the commodity currency and unit', () => expect(commodityPrice.enrich?.('prices', ok, lk)).toMatchObject({ currency: 'USD', unit: 'LBS' }));
  it('leaves CASHEW without a price in the sample', () => expect(seed.tables.prices.some(r => r.commodity === 'CASHEW')).toBe(false));
});
