import { describe, expect, it } from 'vitest';
import { formatAmount, formatDate, groupIndian, parseAmount, parseAmountInput, parseDate, stripGrouping, trimmed } from '@/lib/fields/parse';

describe('amount shorthand entry', () => {
  it.each([
    ['1L', '100000.00'], ['1 lakh', '100000.00'], ['2 LAKHS', '200000.00'], ['1 lac', '100000.00'],
    ['2Cr', '20000000.00'], ['1.25 crores', '12500000.00'], ['500K', '500000.00'], ['2 thousands', '2000.00'],
    ['1M', '1000000.00'], ['2 million', '2000000.00'], ['1mn', '1000000.00'],
    ['1B', '1000000000.00'], ['1 billion', '1000000000.00'], ['1bn', '1000000000.00'], ['1T', '1000000000000.00'],
    ['-1.25L', '-125000.00'], ['(2Cr)', '-20000000.00'], ['1M-', '-1000000.00'],
    ['1,234.5K', '1234500.00'], ['0.00000000001B', '0.01'], ['12345678901234567890.01', '12345678901234567890.01']
  ])('expands %s exactly to %s', (input, expected) => expect(parseAmountInput(input, 2)).toBe(expected));
  it('keeps blank empty and rejects unknown suffixes, invalid grouping and fractions below the currency scale', () => {
    expect(parseAmountInput('', 2)).toBe('');
    for (const value of ['L', '1QQ', '1constructor', '1e3', '12,5L', '1M2', '0.000000000001B']) expect(parseAmountInput(value, 2), value).toBeNull();
    expect(parseAmountInput('0.001K', 0)).toBe('1');
    expect(parseAmountInput('0.000001L', 3)).toBe('0.100');
  });
});

describe('parseAmount', () => {
  it('returns canonical amounts with the given scale', () => {
    expect(parseAmount('1234.5', 2)).toBe('1234.50');
    expect(parseAmount('1,23,456.50', 2)).toBe('123456.50');
    expect(parseAmount(' 1,234 ', 2)).toBe('1234.00');
    expect(parseAmount('.5', 2)).toBe('0.50');
    expect(parseAmount('007', 0)).toBe('7');
    expect(parseAmount(1234.5, 2)).toBe('1234.50');
  });
  it('reads every negative notation', () => {
    expect(parseAmount('-12', 2)).toBe('-12.00');
    expect(parseAmount('1234.50-', 2)).toBe('-1234.50');
    expect(parseAmount('(500.00)', 2)).toBe('-500.00');
    expect(parseAmount('-0', 2)).toBe('0.00');
  });
  it('keeps blank blank and refuses non-numbers and extra decimals', () => {
    expect(parseAmount('', 2)).toBe('');
    expect(parseAmount('abc', 2)).toBeNull();
    expect(parseAmount('-', 2)).toBeNull();
    expect(parseAmount('1.2.3', 2)).toBeNull();
    expect(parseAmount('1.234', 2)).toBeNull();
    expect(parseAmount('1.500', 2)).toBe('1.50');
  });
  it('reads commas only as Indian or western grouping of the whole part', () => {
    expect(parseAmount('1,234', 2)).toBe('1234.00');
    expect(parseAmount('1,23,456.50', 2)).toBe('123456.50');
    expect(parseAmount('1,234,567', 2)).toBe('1234567.00');
    expect(parseAmount('12,34,567', 2)).toBe('1234567.00');
    expect(parseAmount('12,5', 2)).toBeNull();
    expect(parseAmount('1,5', 2)).toBeNull();
    expect(parseAmount('1,2345', 2)).toBeNull();
    expect(parseAmount('1.234,50', 2)).toBeNull();
  });
});

describe('stripGrouping', () => {
  it('removes valid grouping and refuses any other comma', () => {
    expect(stripGrouping('1,234')).toBe('1234');
    expect(stripGrouping('1,23,456')).toBe('123456');
    expect(stripGrouping('12,34,567')).toBe('1234567');
    expect(stripGrouping('1234')).toBe('1234');
    expect(stripGrouping('12,5')).toBeNull();
    expect(stripGrouping('1,2345')).toBeNull();
    expect(stripGrouping(',')).toBeNull();
  });
});

describe('formatAmount', () => {
  it('groups the Indian way and keeps the sign', () => {
    expect(groupIndian('1234567')).toBe('12,34,567');
    expect(groupIndian('123')).toBe('123');
    expect(formatAmount('1234567.50')).toBe('12,34,567.50');
    expect(formatAmount('-123456.00')).toBe('-1,23,456.00');
    expect(formatAmount('12')).toBe('12');
    expect(formatAmount('not a number')).toBe('not a number');
  });
});

describe('parseDate', () => {
  it('reads SAP, ISO, Indian and Excel dates', () => {
    expect(parseDate('2026-04-01')).toBe('2026-04-01');
    expect(parseDate('2026-04-01T00:00:00Z')).toBe('2026-04-01');
    expect(parseDate('20260401')).toBe('2026-04-01');
    expect(parseDate('01-04-2026')).toBe('2026-04-01');
    expect(parseDate('1.4.2026')).toBe('2026-04-01');
    expect(parseDate('01/04/2026')).toBe('2026-04-01');
    expect(parseDate('45292')).toBe('2024-01-01');
  });
  it('reads only five-digit Excel serials, never a bare year or small number', () => {
    expect(parseDate('2026')).toBeNull();
    expect(parseDate('5')).toBeNull();
    expect(parseDate('1234')).toBeNull();
  });
  it('keeps blank blank and refuses impossible dates', () => {
    expect(parseDate('')).toBe('');
    expect(parseDate('00000000')).toBe('');
    expect(parseDate('00005')).toBeNull();
    expect(parseDate('29-02-2025')).toBeNull();
    expect(parseDate('29-02-2024')).toBe('2024-02-29');
    expect(parseDate('31-04-2026')).toBeNull();
    expect(parseDate('tomorrow')).toBeNull();
  });
  it('formats canonical dates as DD-MM-YYYY', () => {
    expect(formatDate('2026-04-01')).toBe('01-04-2026');
    expect(formatDate('')).toBe('');
    expect(formatDate('junk')).toBe('junk');
    expect(trimmed(null)).toBe('');
  });
});
