import { describe, expect, it } from 'vitest';
import { cleanValues, problemText } from '@/lib/fields';
import { checkRow } from '@/lib/grid/grid';

const defs = [
  { field: 'amount', label: 'Amount *', type: 'amount' as const, required: true },
  { field: 'when', label: 'Date', type: 'date' as const }
];

describe('cleanValues', () => {
  it('cleans every value field by its type and drops unknown fields', () => {
    expect(cleanValues(defs, { amount: '1,234.5', when: '01-04-2026', extra: 'x' })).toEqual({ amount: '1234.50', when: '2026-04-01' });
    expect(cleanValues(defs, null)).toEqual({ amount: '', when: '' });
  });
});

describe('problemText', () => {
  it('turns a one-word problem into a sentence and keeps sentences', () => {
    expect(problemText(defs, 'amount', 'required')).toBe('Amount is required');
    expect(problemText(defs, 'amount', 'Amount must be positive.')).toBe('Amount must be positive.');
    expect(problemText(defs, 'nope', 'required')).toBe('nope is required');
  });
});

describe('checkRow with plain rules', () => {
  it('checks field types without a module rule', () => {
    expect(checkRow({ grid: defs }, { amount: '', when: 'x' }, {}, 'add')).toEqual({ amount: 'required', when: 'Date must be a valid date (DD-MM-YYYY).' });
  });
  it('lets a module rule replace the type message', () => {
    const rules = { grid: defs, check: () => ({ amount: 'Amount must be positive.' }) };
    expect(checkRow(rules, { amount: '-1.00', when: '' }, {}, 'edit').amount).toBe('Amount must be positive.');
  });
});
