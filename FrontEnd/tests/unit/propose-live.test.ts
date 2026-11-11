import { describe, expect, it } from 'vitest';
import { blsWithUsd, dealCurrency, toDeal, usdPerUnit } from '@/pages/propose-tradeflows/live';

describe('live Propose data helpers', () => {
  it('reads the deal amount currency as the first currency of the deal currency chain', () => {
    expect(dealCurrency('USD-USD-INR')).toBe('USD');
    expect(dealCurrency('INR-INR-INR')).toBe('INR');
    expect(dealCurrency('')).toBe('');
  });
  it('turns an SAP rate (type M) into USD per unit, direct, indirect (negative) or inverse', () => {
    expect(usdPerUnit({ ExchangeRate: '0.012', NumberOfSourceCurrencyUnits: '1', NumberOfTargetCurrencyUnits: '1' }, false)).toBe('0.012000');
    expect(usdPerUnit({ ExchangeRate: '-83.33', NumberOfSourceCurrencyUnits: '1', NumberOfTargetCurrencyUnits: '1' }, false)).toBe('0.012000');
    expect(usdPerUnit({ ExchangeRate: '83.33', NumberOfSourceCurrencyUnits: '1', NumberOfTargetCurrencyUnits: '1' }, true)).toBe('0.012000');
    expect(usdPerUnit({ ExchangeRate: '1.20', NumberOfSourceCurrencyUnits: '100', NumberOfTargetCurrencyUnits: '1' }, false)).toBe('0.012000');
    expect(usdPerUnit(null, false)).toBeNull();
  });
  it('builds a Deal from a TSF Deal ID and its master contract commodity', () => {
    const mcs = new Map([['2000000005', { commodity: 'C130', commodityDesc: 'ALMOND' }]]);
    expect(toDeal({ dealId: '7000000006', dealDesc: 'OSIPL_FX_2026', mcRef: '2000000005', dealAmount: '1000.00', dealCurrDesc: 'USD-USD-INR', status: '03' }, mcs))
      .toEqual({ dealId: '7000000006', dealDesc: 'OSIPL_FX_2026', tsfCommodity: 'C130', tsfCommodityText: 'ALMOND', amount: '1000.00', currency: 'USD', dealStatus: '03' });
    expect(toDeal({ dealId: '7000000099', dealDesc: '', mcRef: 'X', dealAmount: '5', dealCurrDesc: 'INR-INR-INR' }, mcs).tsfCommodity).toBe('');
  });
  it('values each BL in USD from its trade flow price and currency', () => {
    const tfs = [{ tfNo: '3000000015', tfDate: '2026-11-05', price: '2.1500', currency: 'USD' }, { tfNo: '3000000099', tfDate: '2026-11-05', price: '', currency: '' }];
    const bls = [
      { blNo: '4000000012', tfNo: '3000000015', tfDate: '2026-11-05', quantity: '44000.000' },
      { blNo: '4000000099', tfNo: '3000000099', tfDate: '2026-11-05', quantity: '1.000' }
    ];
    expect(blsWithUsd(bls, tfs, {}).map(b => b.usdValue)).toEqual(['94600.00', '']);
  });
});
