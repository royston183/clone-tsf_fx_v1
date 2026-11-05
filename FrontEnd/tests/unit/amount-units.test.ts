import { describe, expect, it } from 'vitest';
import { amountInUnit } from '@/lib/fields/amount-units';
import { parseAmountInput } from '@/lib/fields/parse';
import { DEFAULT_UNITS } from '@/lib/report/types';

const [absolute, thousands, lakhs, crores] = DEFAULT_UNITS;

describe('amount entry units', () => {
  it('converts in both directions without changing the currency amount', () => {
    for (const [unit, shown] of [[absolute, '2500000.00'], [thousands, '2500.00'], [lakhs, '25.00'], [crores, '0.25']] as const) {
      expect(amountInUnit('2500000.00', unit)).toBe(shown);
      const suffix = ({ ABSOLUTE: '', THOUSANDS: 'K', LAKHS: 'L', CRORES: 'Cr' })[unit.id];
      expect(parseAmountInput(shown + suffix, 2)).toBe('2500000.00');
    }
    expect(parseAmountInput('1,234.5K', 2)).toBe('1234500.00');
    expect(parseAmountInput('(0.25Cr)', 2)).toBe('-2500000.00');
  });

  it('retains cents, negative amounts, zero, large values and currency-specific scales', () => {
    for (const scale of [0, 2, 3, 4]) {
      for (const value of [scale ? `0.${'0'.repeat(scale - 1)}1` : '1', `-12345678901234567890${scale ? `.${'7'.repeat(scale)}` : ''}`, scale ? `0.${'0'.repeat(scale)}` : '0']) {
        for (const unit of DEFAULT_UNITS) {
          const suffix = ({ ABSOLUTE: '', THOUSANDS: 'K', LAKHS: 'L', CRORES: 'Cr' })[unit.id];
          expect(parseAmountInput(amountInUnit(value, unit, scale) + suffix, scale)).toBe(value);
        }
      }
    }
    expect(amountInUnit('0.01', crores)).toBe('0.000000001');
    expect(parseAmountInput('0.000000001Cr', 2)).toBe('0.01');
    expect(amountInUnit('1234567.50', lakhs)).toBe('12.345675');
  });

  it('keeps blanks empty and refuses invalid grouping and sub-cent entries instead of rounding', () => {
    expect(parseAmountInput('', 2)).toBe('');
    expect(amountInUnit('', lakhs)).toBe('');
    for (const value of ['abc', '12,5Cr', '0.0000000001Cr']) expect(parseAmountInput(value, 2)).toBeNull();
    expect(amountInUnit('bad', lakhs)).toBe('bad');
  });
});
