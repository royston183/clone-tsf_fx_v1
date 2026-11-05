// tests/unit/odata-filter.test.ts
import { describe, expect, it } from 'vitest';
import { compileFilter, orderRows } from '../support/odata-filter';

const rows = [
  { Deal: 'D1', Name: "O'Brien", Amount: 900, Start: '2026-04-01', Active: true },
  { Deal: 'D2', Name: 'Axis', Amount: 1500, Start: '2026-05-01', Active: false },
  { Deal: 'D3', Name: 'Bharat', Amount: 1500, Start: '2026-03-01', Active: true }
];

describe('mock SAP $filter', () => {
  it('evaluates contains, eq, ge, le, and, or and parentheses', () => {
    const deals = (f: string) => rows.filter(compileFilter(f)).map(r => r.Deal);
    expect(deals("contains(Name,'O''Brien')")).toEqual(['D1']);
    expect(deals("(Deal eq 'D1' or Deal eq 'D3') and Active eq true")).toEqual(['D1', 'D3']);
    expect(deals('Amount ge 1000.00 and Amount le 1500')).toEqual(['D2', 'D3']);
    expect(deals('Start ge 2026-04-01')).toEqual(['D1', 'D2']);
  });
  it('rejects what the template never sends', () => {
    expect(() => compileFilter("Name ne 'x'")).toThrow('Unsupported operator ne');
    expect(() => compileFilter("Name eq 'x")).toThrow('Unterminated string');
  });
  it('orders by several properties', () => {
    expect(orderRows(rows, 'Amount desc,Deal asc').map(r => r.Deal)).toEqual(['D2', 'D3', 'D1']);
  });
});
