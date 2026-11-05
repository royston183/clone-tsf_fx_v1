// tests/unit/totals.test.ts
import { describe, expect, it } from 'vitest';
import { totalsByCurrency } from '@/lib/items/totals';

const fields = [
  { field: 'amount', label: 'Amount', type: 'amount' as const, currencyField: 'currency' },
  { field: 'rate', label: 'Rate', type: 'decimal' as const, scale: 4 }
];

describe('totalsByCurrency', () => {
  it('sums per currency exactly and never across currencies', () => {
    const rows = [
      { amount: '0.10', currency: 'INR' }, { amount: '0.20', currency: 'inr' }, { amount: '1,00,000.05', currency: 'USD' },
      { amount: '-50.00', currency: 'USD' }, { amount: 'abc', currency: 'INR' }, { amount: '7', currency: '' }, { amount: '', currency: 'EUR' }
    ];
    expect(totalsByCurrency(rows, fields, ['amount'])).toEqual([
      { currency: 'INR', sums: { amount: '0.30' } },
      { currency: 'USD', sums: { amount: '99950.05' } },
      { currency: '', sums: { amount: '7.00' } }
    ]);
  });
  it("keeps each field's scale and the sign", () => {
    expect(totalsByCurrency([{ rate: '1.2345' }, { rate: '0.0005' }], fields, ['rate'])).toEqual([{ currency: '', sums: { rate: '1.2350' } }]);
    expect(totalsByCurrency([{ amount: '-0.05', currency: 'INR' }], fields, ['amount'])).toEqual([{ currency: 'INR', sums: { amount: '-0.05' } }]);
    expect(totalsByCurrency([], fields, ['amount'])).toEqual([]);
  });
});
