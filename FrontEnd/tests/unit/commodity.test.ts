import { describe, expect, it } from 'vitest';
import { commodity, UNITS } from '@/modules/commodity/definition';
import { MODULES } from '@/modules/registry';

const tab = commodity.tabs[0];
const lk = commodity.lookups(undefined);
const ok = { commodity: 'ALMOND', description: 'Almonds', unit: 'LBS', currency: 'USD' };

describe('commodity module', () => {
  it('is registered and opens in a pop-up', () => {
    expect(MODULES.commodity).toBe(commodity);
    expect(commodity.opens).toEqual({ create: 'popup', open: 'popup' });
  });
  it('offers the three units', () => expect(UNITS.map(u => u.value)).toEqual(['LBS', 'KG', 'MTS']));
  it('accepts a complete row', () => expect(Object.values(tab.check(ok, lk, 'add')).filter(Boolean)).toEqual([]));
  it('refuses an unknown unit and a bad currency', () => {
    expect(tab.check({ ...ok, unit: 'TON', currency: 'US' }, lk, 'add')).toMatchObject({
      unit: "Unit 'TON' must be LBS, KG or MTS.", currency: 'Currency must be a 3-letter code, e.g. USD.'
    });
  });
});
