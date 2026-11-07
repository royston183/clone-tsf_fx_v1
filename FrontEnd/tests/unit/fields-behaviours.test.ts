import { describe, expect, it } from 'vitest';
import { behaviourOf, checkFields, expand, formatField, isFlag, matchOption, MONTHS, typeOf, valueFields, type AnyField } from '@/lib/fields';
import type { Option } from '@/lib/grid/types';

const kinds: Option[] = [{ value: '01', label: 'Day(s)' }, { value: '02', label: 'Month(s)' }];
const f = (d: Partial<AnyField> & { type?: AnyField['type'] }): AnyField => ({ field: 'x', label: 'X *', ...d });
const clean = (d: AnyField, v: unknown) => behaviourOf(d).clean(v, d);
const check = (d: AnyField, v: string, lk: unknown = {}) => behaviourOf(d).check(v, d, { row: { [d.field]: v }, lk });

describe('typeOf maps legacy shorthands', () => {
  it('reads type, flag, options and lookup', () => {
    expect(typeOf(f({ type: 'amount' }))).toBe('amount');
    expect(typeOf(f({ flag: true }))).toBe('flag');
    expect(typeOf(f({ options: kinds }))).toBe('select');
    expect(typeOf(f({ lookup: () => [] }))).toBe('suggest');
    expect(typeOf(f({}))).toBe('text');
    expect(isFlag(f({ type: 'toggle' }))).toBe(true);
  });
});

describe('text and code', () => {
  it('legacy text keeps its own clean; typed text collapses spaces and checks length', () => {
    expect(clean(f({ clean: v => v.toUpperCase() }), ' ab ')).toBe('AB');
    expect(clean(f({}), '  a  b ')).toBe('a  b');
    expect(clean(f({ type: 'text', max: 4 }), '  a   b ')).toBe('a b');
    expect(clean(f({ type: 'text', max: 3 }), 'abcdef')).toBe('abcdef');
    expect(check(f({ type: 'text', max: 3 }), 'abcd')).toBe('X allows at most 3 characters.');
    expect(check(f({ type: 'text', max: 3 }), clean(f({ type: 'text', max: 3 }), 'abcdef'))).toBe('X allows at most 3 characters.');
    expect(clean(f({ type: 'code', max: 4 }), ' ab-1x9 ')).toBe('AB-1X9');
    expect(check(f({ type: 'code', max: 4 }), 'AB-1X9')).toBe('X allows at most 4 characters.');
  });
});

describe('integer', () => {
  it('drops grouping, keeps leading zeros as typed, pads NUMC, blanks zero', () => {
    expect(clean(f({ type: 'integer' }), '1,234')).toBe('1234');
    expect(clean(f({ type: 'integer' }), '12,5')).toBe('12,5');
    expect(check(f({ type: 'integer' }), '12,5')).toBe('X must be a whole number.');
    expect(clean(f({ type: 'integer' }), '00005')).toBe('00005');
    expect(clean(f({ type: 'integer', keepZeros: true, max: 5 }), '5')).toBe('00005');
    expect(check(f({ type: 'integer' }), '1.5')).toBe('X must be a whole number.');
    expect(check(f({ type: 'integer', max: 3 }), '1234')).toBe('X allows at most 3 digits.');
    expect(formatField(f({ type: 'integer', zeroBlank: true }), { x: '000' }, {})).toBe('');
    expect(behaviourOf(f({ type: 'integer' })).align).toBe('right');
  });
});

describe('amount and decimal', () => {
  it('normalizes shorthand for form saves, grid paste and SAP writes, enforcing base precision', () => {
    const amount = f({ type: 'amount', label: 'Amount', precision: 15 });
    const behaviour = behaviourOf(amount);
    expect(behaviour.clean('1L', amount)).toBe('100000.00');
    expect(behaviour.paste('1.25M', amount, {})).toBe('1250000.00');
    expect(behaviour.toSap('2Cr', amount)).toBe(20000000);
    expect(behaviour.format('1B', amount, { row: {}, lk: {} })).toBe('1,000,000,000.00');
    expect(check(f({ type: 'amount', label: 'Amount', precision: 5 }), '1L')).toContain('too large');
    expect(check(f({ type: 'decimal', label: 'Rate' }), '1L')).toContain('must be an amount');
  });
  const amt = f({ type: 'amount', label: 'Amount' });
  it('cleans, checks, formats and converts', () => {
    expect(clean(amt, '123,456.5')).toBe('123456.50');
    expect(clean(amt, '1234.50-')).toBe('-1234.50');
    expect(clean(amt, 'abc')).toBe('abc');
    expect(clean(amt, '12,5')).toBe('12,5');
    expect(check(amt, '12,5')).toBe('Amount must be an amount with at most 2 decimals, e.g. 1234.50.');
    expect(check(amt, 'abc')).toBe('Amount must be an amount with at most 2 decimals, e.g. 1234.50.');
    expect(check(f({ type: 'amount', label: 'Amount', precision: 5 }), '12345.00')).toBe('Amount is too large (at most 3 digits before the decimal point).');
    expect(formatField(amt, { x: '1234567.50' }, {})).toBe('1,234,567.50');
    expect(behaviourOf(amt).toSap('1234.50', amt)).toBe(1234.5);
    expect(behaviourOf(amt).toSap('', amt)).toBeNull();
    expect(behaviourOf(amt).fromSap(1234.5, amt)).toBe('1234.50');
    expect(clean(f({ type: 'decimal', scale: 4 }), '0.12345')).toBe('0.12345');
    expect(clean(f({ type: 'decimal', scale: 4 }), '0.1')).toBe('0.1000');
  });
});

describe('date and date range', () => {
  const d = f({ type: 'date', label: 'Valid From' });
  it('cleans to ISO, refuses impossible days, displays DD-MM-YYYY, sends null for blank', () => {
    expect(clean(d, '01-04-2026')).toBe('2026-04-01');
    expect(clean(d, '29-02-2025')).toBe('29-02-2025');
    expect(check(d, '29-02-2025')).toBe('Valid From must be a valid date (DD-MM-YYYY).');
    expect(formatField(d, { x: '2026-04-01' }, {})).toBe('01-04-2026');
    expect(behaviourOf(d).toSap('', d)).toBeNull();
    expect(behaviourOf(d).fromSap('2026-04-01T00:00:00Z', d)).toBe('2026-04-01');
  });
  it('a range expands to two dates and checks the order', () => {
    const range = f({ field: 'from', type: 'dateRange', label: 'Validity *', toField: 'to', required: true });
    expect(expand(range).map(x => [x.field, typeOf(x)])).toEqual([['from', 'date'], ['to', 'date']]);
    expect(checkFields([range], { from: '2026-04-02', to: '2026-04-01' }, {})).toEqual({ from: '', to: 'Validity: the end date must not be before the start date.' });
    expect(checkFields([range], { from: '', to: '' }, {})).toEqual({ from: 'required', to: 'required' });
  });
});

describe('period', () => {
  it('expands to a month select and a year', () => {
    const p = f({ field: 'month', type: 'period', label: 'Period', yearField: 'year' });
    const [m, y] = expand(p);
    expect([m.field, typeOf(m), y.field, typeOf(y)]).toEqual(['month', 'select', 'year', 'integer']);
    expect(MONTHS[3]).toEqual({ value: '04', label: '04 - April' });
    expect(checkFields([p], { month: '13', year: '2026' }, {}).month).toBe("Period '13' is not a valid option.");
  });
});

describe('period paste and display', () => {
  it('reads the month from many spellings and never guesses from digits', () => {
    const m = (v: string) => matchOption(MONTHS, v);
    expect([m('04-2026'), m('2026-04'), m('04/2026'), m('April'), m('apr'), m('4'), m('04')]).toEqual(['04', '04', '04', '04', '04', '04', '04']);
    expect([m('13'), m('0'), m('x')]).toEqual(['', '', '']);
    expect(matchOption(kinds, '04-2026')).toBe('');
    expect(matchOption(kinds, '13')).toBe('');
  });
  it('shows MM-YYYY and DD-MM-YYYY – DD-MM-YYYY', () => {
    const p = f({ field: 'month', type: 'period', label: 'Period', yearField: 'year' });
    expect(formatField(p, { month: '04', year: '2026' }, {})).toBe('04-2026');
    expect(formatField(p, { month: '04', year: '' }, {})).toBe('04');
    const r = f({ field: 'from', type: 'dateRange', label: 'Validity', toField: 'to' });
    expect(formatField(r, { from: '2026-04-01', to: '2026-09-30' }, {})).toBe('01-04-2026 – 30-09-2026');
    expect(formatField(r, { from: '2026-04-01', to: '' }, {})).toBe('01-04-2026');
    expect(formatField(r, { from: '', to: '2026-09-30' }, {})).toBe('30-09-2026');
  });
});

describe('select, segmented, suggest, multiSelect', () => {
  it('matches pasted option text the legacy way', () => {
    expect(matchOption(kinds, 'Month(s)')).toBe('02');
    expect(matchOption(kinds, 'monthly')).toBe('02');
    expect(matchOption(kinds, '')).toBe('');
    const sel = f({ type: 'select', label: 'Kind', options: kinds });
    expect(behaviourOf(sel).paste('day(s)', sel, {})).toBe('01');
    expect(check(sel, '09')).toBe("Kind '09' is not a valid option.");
    expect(formatField(sel, { x: '02' }, {})).toBe('Month(s)');
  });
  it('suggest checks the lookup and shows code and text', () => {
    const cur = f({ type: 'suggest', label: 'Currency', lookup: () => [{ CODE: 'INR', TEXT: 'Indian Rupee' }] });
    expect(check(cur, 'XXX')).toBe("Currency 'XXX' is not in the list.");
    expect(check(cur, 'INR')).toBe('');
    expect(formatField(cur, { x: 'INR' }, {})).toBe('INR - Indian Rupee');
    expect(behaviourOf(cur).paste('indian rupee', cur, {})).toBe('INR');
  });
  it('multiSelect normalizes, checks each value and formats labels', () => {
    const ms = f({ type: 'multiSelect', label: 'Kinds', options: kinds });
    expect(clean(ms, ' 02; 01 ,02 ')).toBe('02,01');
    expect(check(ms, '01,09')).toBe("Kinds '09' is not a valid option.");
    expect(formatField(ms, { x: '01,02' }, {})).toBe('Day(s), Month(s)');
    expect(behaviourOf(ms).paste('Day(s), Month(s)', ms, {})).toBe('01,02');
  });
});

describe('flag, textarea, file, display', () => {
  it('flags become X or blank', () => {
    const fl = f({ flag: true });
    expect([true, 'X', 'yes', '1', false, '', 'no'].map(v => clean(fl, v))).toEqual(['X', 'X', 'X', 'X', '', '', '']);
    expect(formatField(fl, { x: 'X' }, {})).toBe('Yes');
  });
  it('textarea keeps line breaks and shows the first line in tables', () => {
    const ta = f({ type: 'textarea', max: 10 });
    expect(clean(ta, 'a  \r\nb ')).toBe('a\nb');
    expect(formatField(ta, { x: 'first\nsecond' }, {})).toBe('first …');
    expect(check(ta, 'x'.repeat(11))).toBe('X allows at most 10 characters.');
  });
  it('file checks the extension', () => {
    const file = f({ type: 'file', label: 'File', accept: ['.xlsx', '.csv'] });
    expect(check(file, 'data.XLSX')).toBe('');
    expect(check(file, 'data.pdf')).toBe('File must be a .xlsx or .csv file.');
  });
  it('display and computed fields are never value fields', () => {
    const defs = [f({ field: 'a' }), f({ field: 'b', type: 'display' }), f({ field: 'c', computed: () => 'x' })];
    expect(valueFields(defs).map(d => d.field)).toEqual(['a']);
  });
  it('checkFields reports required with one word', () => {
    expect(checkFields([f({ field: 'a', required: true }), f({ field: 'b', type: 'integer' })], { a: '', b: '1x' }, {}))
      .toEqual({ a: 'required', b: 'X must be a whole number.' });
  });
});
