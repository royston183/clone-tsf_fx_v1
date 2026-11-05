// tests/unit/report-units.test.ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_UNITS } from '@/lib/report/types';
import { formatInUnit, formatPercent, inUnit, isZero, sumAmounts, unitById, unitsOf } from '@/lib/report/units';

const LAKHS = DEFAULT_UNITS[2];

describe('units', () => {
  it('scales exactly by powers of ten, rounding half away from zero to two decimals', () => {
    expect(inUnit('1234567.50', 100000)).toBe('12.35');
    expect(inUnit('-395000.00', 100000)).toBe('-3.95');
    expect(inUnit('25000', 1)).toBe('25000.00');
    expect(inUnit('5', 1000)).toBe('0.01');
    expect(inUnit('-0.004', 1)).toBe('0.00');
    expect(inUnit('', 1000)).toBe('');
    expect(inUnit('n/a', 1000)).toBe('n/a');
    expect(inUnit('1000', 250)).toBe('4.00');
  });
  it('formats amounts in a unit with Indian grouping, zero blank on request', () => {
    expect(formatInUnit('1234567.50', LAKHS)).toBe('12.35');
    expect(formatInUnit('123456789.00', DEFAULT_UNITS[0])).toBe('12,34,56,789.00');
    expect(formatInUnit('0.00', DEFAULT_UNITS[0], true)).toBe('');
    expect(formatInUnit('0.00', DEFAULT_UNITS[0])).toBe('0.00');
    expect(formatPercent('-17.54')).toBe('-17.54 %');
    expect(formatPercent('')).toBe('');
  });
  it('sums decimal strings exactly and skips what is not a number', () => {
    expect(sumAmounts(['0.10', '0.20'])).toBe('0.30');
    expect(sumAmounts(['1.5', 'x', '-2.25'])).toBe('-0.75');
    expect(sumAmounts([])).toBe('0.00');
  });
  it('knows zero and picks units', () => {
    expect([isZero('0.00'), isZero(''), isZero('-0.00'), isZero(undefined), isZero('0.01')]).toEqual([true, true, true, true, false]);
    expect(unitsOf()).toBe(DEFAULT_UNITS);
    expect(unitById(DEFAULT_UNITS, 'LAKHS')).toBe(LAKHS);
    expect(unitById(DEFAULT_UNITS, 'NOPE')).toBe(DEFAULT_UNITS[0]);
  });
});
