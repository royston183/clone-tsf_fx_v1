import { describe, expect, it } from 'vitest';
import type { Row } from '@/lib/grid/types';
import type { AnyList } from '@/lib/list/types';
import { HttpError } from '@/lib/errors';
import { applyQuery, listODataQuery, parseListQuery } from '@core/server/list-query';

const list: AnyList = {
  entity: 'deals', keys: ['deal'], columns: [],
  fields: [
    { field: 'deal', label: 'Deal', type: 'code', max: 10 },
    { field: 'name', label: 'Counterparty', type: 'text', max: 40 },
    { field: 'type', label: 'Product Type', type: 'select', options: [{ value: '01', label: 'Loan' }, { value: '02', label: 'Deposit' }] },
    { field: 'amount', label: 'Amount', type: 'amount' },
    { field: 'start', label: 'Start', type: 'date' },
    { field: 'term', label: 'Term', type: 'integer', max: 3 },
    { field: 'active', label: 'Active', type: 'flag' }
  ],
  search: ['deal', 'name'], filters: ['name', 'type', 'amount', 'start', 'term', 'active'], sort: ['amount', 'start', 'name'],
  defaultSort: { field: 'deal', dir: 1 }, pageSizes: [50, 100]
};
const names = { prop: (f: string) => f[0].toUpperCase() + f.slice(1), numbers: new Set(['term']), flagType: 'boolean' as const };
const fails = (raw: unknown): HttpError => {
  try { parseListQuery(list, raw, {}); } catch (e) { return e as HttpError; }
  throw new Error('expected a 400');
};

describe('parseListQuery', () => {
  it('cleans values by their field type', () => {
    const q = parseListQuery(list, { filters: [{ field: 'amount', op: 'between', values: ['1,000', ''] }, { field: 'start', op: 'eq', values: ['01-04-2026'] }], page: 1, pageSize: 50 }, {});
    expect(q.filters).toEqual([{ field: 'amount', op: 'between', values: ['1000.00', ''] }, { field: 'start', op: 'eq', values: ['2026-04-01'] }]);
  });
  it('allows only declared fields, allowed operators and valid values', () => {
    expect(fails({ page: 1, pageSize: 50, filters: [{ field: 'secret', op: 'eq', values: ['x'] }] })).toMatchObject({ status: 400, message: 'Filtering by secret is not allowed.' });
    expect(fails({ page: 1, pageSize: 50, filters: [{ field: 'amount', op: 'contains', values: ['1'] }] })).toMatchObject({ status: 400, message: "Amount cannot be filtered with 'contains'." });
    expect(fails({ page: 1, pageSize: 50, filters: [{ field: 'start', op: 'eq', values: ['31-02-2026'] }] })).toMatchObject({ status: 400, message: 'Start must be a valid date (DD-MM-YYYY).' });
    expect(fails({ page: 1, pageSize: 50, filters: [{ field: 'type', op: 'eq', values: ['99'] }] })).toMatchObject({ status: 400, message: "Product Type '99' is not a valid option." });
    expect(fails({ page: 1, pageSize: 50, sort: { field: 'term', dir: 1 } })).toMatchObject({ status: 400, message: 'Sorting by term is not allowed.' });
    expect(fails({ page: 1, pageSize: 50, sort: { field: 'amount', dir: 2 } })).toMatchObject({ status: 400 });
  });
  it('enforces the limits', () => {
    expect(fails({ page: 0, pageSize: 50 })).toMatchObject({ status: 400, message: 'page must be a whole number from 1 to 1000000.' });
    expect(fails({ page: 1, pageSize: 75 })).toMatchObject({ status: 400, message: 'pageSize must be one of 50, 100.' });
    expect(fails({ page: 1, pageSize: 50, search: 'x'.repeat(101) })).toMatchObject({ status: 400, message: 'Search allows at most 100 characters.' });
    expect(fails({ page: 1, pageSize: 50, filters: Array.from({ length: 11 }, () => ({ field: 'name', op: 'contains', values: ['a'] })) })).toMatchObject({ status: 400, message: 'Use at most 10 filters.' });
    expect(fails({ page: 1, pageSize: 50, filters: [{ field: 'type', op: 'in', values: Array.from({ length: 51 }, () => '01') }] })).toMatchObject({ status: 400, message: 'Product Type: use at most 50 values.' });
    expect(fails({ page: 1, pageSize: 50, filters: [{ field: 'amount', op: 'between', values: ['', ''] }] })).toMatchObject({ status: 400, message: 'Amount: give a from or a to value.' });
  });
});

describe('listODataQuery', () => {
  it('escapes quotes in search and filters, writes dates, numbers and flags bare, and pages with a stable order', () => {
    const q = parseListQuery(list, {
      search: "O'Brien",
      filters: [
        { field: 'type', op: 'in', values: ['01', '02'] }, { field: 'amount', op: 'between', values: ['1,000', ''] },
        { field: 'start', op: 'eq', values: ['01-04-2026'] }, { field: 'term', op: 'eq', values: ['12'] },
        { field: 'active', op: 'eq', values: ['X'] }, { field: 'name', op: 'contains', values: ["d'Souza"] }
      ],
      sort: { field: 'amount', dir: -1 }, page: 3, pageSize: 50
    }, {});
    const p = listODataQuery(list, q, names);
    expect(p.get('$filter')).toBe("(contains(Deal,'O''Brien') or contains(Name,'O''Brien')) and (Type eq '01' or Type eq '02') and Amount ge 1000.00 and Start eq 2026-04-01 and Term eq 12 and Active eq true and contains(Name,'d''Souza')");
    expect(p.get('$orderby')).toBe('Amount desc,Deal asc');
    expect(p.get('$top')).toBe('50');
    expect(p.get('$skip')).toBe('100');
    expect(p.get('$count')).toBe('true');
    expect(p.toString()).toContain('O%27%27Brien');
    expect(p.toString()).not.toContain("'");
  });
  it('quotes NUMC integers and char flags', () => {
    const q = parseListQuery(list, { filters: [{ field: 'term', op: 'between', values: ['5', '12'] }, { field: 'active', op: 'eq', values: [''] }], page: 1, pageSize: 50 }, {});
    expect(listODataQuery(list, q, { ...names, numbers: new Set(), flagType: 'char' }).get('$filter')).toBe("(Term ge '005' and Term le '012') and Active eq ''");
  });
  it('sorts by the default field and never repeats a key', () => {
    expect(listODataQuery(list, { page: 1, pageSize: 50 }, names).get('$orderby')).toBe('Deal asc');
    expect(listODataQuery(list, { page: 1, pageSize: 50 }, names).has('$filter')).toBe(false);
  });
});

describe('applyQuery', () => {
  const rows: Row[] = [
    { deal: 'D3', name: "O'Brien Capital", type: '01', amount: '900.00', start: '2026-04-01', term: '12', active: 'X' },
    { deal: 'D1', name: 'Axis', type: '02', amount: '1500.00', start: '2026-05-01', term: '6', active: '' },
    { deal: 'D2', name: 'Bharat', type: '01', amount: '1500.00', start: '2026-03-01', term: '24', active: 'X' },
    { deal: 'D4', name: 'Coastal', type: '01', amount: '10000.00', start: '2026-04-01', term: '12', active: 'X' }
  ];
  it('filters, sorts numerically with the key as tie-break, and pages', () => {
    const page = applyQuery(rows, { filters: [{ field: 'type', op: 'in', values: ['01'] }], sort: { field: 'amount', dir: -1 }, page: 1, pageSize: 2 }, list);
    expect(page.total).toBe(3);
    expect(page.rows.map(r => r.deal)).toEqual(['D4', 'D2']);
    expect(applyQuery(rows, { sort: { field: 'amount', dir: 1 }, page: 1, pageSize: 50 }, list).rows.map(r => r.deal)).toEqual(['D3', 'D1', 'D2', 'D4']);
  });
  it('searches case-sensitively like SAP contains()', () => {
    expect(applyQuery(rows, { search: "O'Brien", page: 1, pageSize: 50 }, list).rows.map(r => r.deal)).toEqual(['D3']);
    expect(applyQuery(rows, { search: "o'brien", page: 1, pageSize: 50 }, list).total).toBe(0);
  });
  it('searches the application data whatever the case of A–Z (caseless)', () => {
    expect(applyQuery(rows, { search: "o'BRIEN", page: 1, pageSize: 50 }, list, new Set(), { caseless: true }).rows.map(r => r.deal)).toEqual(['D3']);
  });
  it('applies open-ended ranges and flags', () => {
    expect(applyQuery(rows, { filters: [{ field: 'start', op: 'between', values: ['2026-04-01', ''] }, { field: 'active', op: 'eq', values: ['X'] }], page: 1, pageSize: 50 }, list).rows.map(r => r.deal)).toEqual(['D3', 'D4']);
    expect(applyQuery(rows, { filters: [{ field: 'term', op: 'between', values: ['', '12'] }], page: 1, pageSize: 50 }, list).rows.map(r => r.deal)).toEqual(['D1', 'D3', 'D4']);
  });
});

describe('fix round 1', () => {
  const nq = (filters: unknown[], extra: object = {}) => parseListQuery(list, { filters, page: 1, pageSize: 50, ...extra }, {});
  it('pads NUMC integers to their length and compares them the same way in the mock', () => {
    const q = nq([{ field: 'term', op: 'between', values: ['5', '12'] }]);
    expect(listODataQuery(list, q, { ...names, numbers: new Set(), flagType: 'char' }).get('$filter')).toBe("(Term ge '005' and Term le '012')");
    const rows: Row[] = [{ deal: 'A', term: '005' }, { deal: 'B', term: '012' }, { deal: 'C', term: '100' }];
    expect(applyQuery(rows, q, list).rows.map(r => r.deal)).toEqual(['A', 'B']);
    expect(applyQuery(rows, q, list, new Set(['term'])).rows.map(r => r.deal)).toEqual(['A', 'B']);
    const mixed: Row[] = [{ deal: 'A', term: '5' }, { deal: 'B', term: '12' }];
    expect(applyQuery(mixed, q, list, new Set(['term'])).rows).toHaveLength(2);
  });
  it('bounds the page', () => {
    expect(fails({ page: 1e21, pageSize: 50 })).toMatchObject({ status: 400 });
    expect(fails({ page: 1_000_001, pageSize: 50 })).toMatchObject({ status: 400 });
    expect(listODataQuery(list, nq([], { page: 1_000_000 }), names).get('$skip')).toBe('49999950');
  });
  it('never turns long digit strings into Infinity or exponents', () => {
    const open: AnyList = { ...list, fields: [...list.fields.filter(f => f.field !== 'term'), { field: 'term', label: 'Term', type: 'integer' }] };
    const big = (v: string) => { try { parseListQuery(open, { page: 1, pageSize: 50, filters: [{ field: 'term', op: 'eq', values: [v] }] }, {}); } catch (e) { return e as HttpError; } throw new Error('expected a 400'); };
    expect(big('9'.repeat(400))).toMatchObject({ status: 400, message: 'Term allows at most 15 digits.' });
    expect(big('9'.repeat(21))).toMatchObject({ status: 400 });
    const q = parseListQuery(open, { page: 1, pageSize: 50, filters: [{ field: 'term', op: 'eq', values: ['000123456789012'] }] }, {});
    expect(listODataQuery(open, q, { ...names, numbers: new Set(['term']) }).get('$filter')).toBe('Term eq 123456789012');
    expect(fails({ page: 1, pageSize: 50, filters: [{ field: 'amount', op: 'eq', values: ['1'.repeat(16)] }] })).toMatchObject({ status: 400 });
    const rows: Row[] = [{ deal: 'A', amount: '12345678901234567.10' }, { deal: 'B', amount: '12345678901234567.20' }];
    expect(applyQuery(rows, { sort: { field: 'amount', dir: -1 }, page: 1, pageSize: 50 }, list).rows.map(r => r.deal)).toEqual(['B', 'A']);
    expect(applyQuery(rows, { filters: [{ field: 'amount', op: 'eq', values: ['12345678901234567.10'] }], page: 1, pageSize: 50 }, list).rows.map(r => r.deal)).toEqual(['A']);
  });
  it('rejects unrecognised flag values', () => {
    expect(fails({ page: 1, pageSize: 50, filters: [{ field: 'active', op: 'eq', values: ['maybe'] }] })).toMatchObject({ status: 400 });
    expect(nq([{ field: 'active', op: 'eq', values: ['yes'] }]).filters?.[0].values).toEqual(['X']);
    expect(nq([{ field: 'active', op: 'eq', values: ['no'] }]).filters?.[0].values).toEqual(['']);
  });
  it('treats an integer without max as a number, not a NUMC string', () => {
    const open: AnyList = { ...list, fields: [...list.fields.filter(f => f.field !== 'term'), { field: 'term', label: 'Term', type: 'integer' }] };
    const rows: Row[] = [{ deal: 'A', term: '100' }, { deal: 'B', term: '12' }, { deal: 'C', term: '5' }];
    expect(applyQuery(rows, { sort: { field: 'term', dir: 1 }, page: 1, pageSize: 50 }, { ...open, sort: ['term'] }).rows.map(r => r.deal)).toEqual(['C', 'B', 'A']);
    const q = parseListQuery(open, { page: 1, pageSize: 50, filters: [{ field: 'term', op: 'between', values: ['5', '12'] }] }, {});
    expect(applyQuery(rows, q, open).rows.map(r => r.deal)).toEqual(['B', 'C']);
    const seven = parseListQuery(open, { page: 1, pageSize: 50, filters: [{ field: 'term', op: 'eq', values: ['007'] }] }, {});
    expect(listODataQuery(open, seven, { ...names, numbers: new Set() }).get('$filter')).toBe("Term eq '7'");
    expect(listODataQuery(open, seven, names).get('$filter')).toBe('Term eq 7');
  });
});
