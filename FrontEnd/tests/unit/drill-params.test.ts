// tests/unit/drill-params.test.ts
import { describe, expect, it } from 'vitest';
import { shownUnit } from '@/lib/client/use-unit';
import { drillHref, drillStack, openHref, pageWith, parseDrillParams, safeFrom, selectionParams, urlRunOf, urlSelection } from '@/lib/drill/params';
import { DEFAULT_UNITS } from '@/lib/report/types';
import type { AnyField } from '@/lib/fields';

const fields: AnyField[] = [
  { field: 'company', label: 'Company Code', type: 'code', max: 4 },
  { field: 'month', label: 'Period', type: 'period', yearField: 'year' },
  { field: 'product', label: 'Product Type', type: 'select', options: [{ value: '51A', label: '51A Term Loan' }] },
  { field: 'amount', label: 'Amount', type: 'amount' },
  { field: 'name', label: 'Name', type: 'text', max: 60 }
];
const parse = (q: string, prefix: 's' | 'f' = 'f') => parseDrillParams(new URLSearchParams(q), prefix, fields, {});

describe('safeFrom', () => {
  it('accepts only same-app paths', () => {
    expect(safeFrom('/samples/liquidity-statement?s.company=1000&hl=A%3A01')).toBe('/samples/liquidity-statement?s.company=1000&hl=A%3A01');
    expect(safeFrom('/a/../b')).toBe('/b');
    expect(safeFrom('/%2F%2Fevil.com')).toBe('/%2F%2Fevil.com');
    for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com', 'javascript:alert(1)', ' /x', '/x\ny', '/x\u0000', '', null, undefined, `/${'x'.repeat(2001)}`]) expect(safeFrom(bad)).toBeNull();
  });
  it('rejects dot-segment tricks that normalise to a protocol-relative URL', () => {
    for (const bad of ['/.//evil.com', '/%2e//evil.com', '/%2E//evil.com', '/a/..//evil.com', '/.%2e//evil.com', 'data:text/html,x', '/x	y']) expect(safeFrom(bad)).toBeNull();
    const r = safeFrom('/%5Cevil.com');
    expect(r === null || (!r.startsWith('//') && !r.includes('\\') && !/^[a-z][a-z0-9+.-]*:/i.test(r))).toBe(true);
  });
});

describe('parseDrillParams', () => {
  it('cleans and checks each value by its field type', () => {
    expect(parse('f.company=1000&f.month=01&f.year=2026&f.product=51A&f.amount=125,000&f.name=O%27Brien').values)
      .toEqual({ company: '1000', month: '01', year: '2026', product: '51A', amount: '125000.00', name: "O'Brien" });
  });
  it('drops unknown fields, invalid values, duplicates and over-long values', () => {
    const out = parse(`f.product=99Z&f.secret=1&f.__proto__=x&f.amount=1e9)%20or%20(1%20eq%201&f.company=1000&f.company=2000&f.name=${'x'.repeat(61)}&f.month=13&s.company=3000`);
    expect(out.values).toEqual({ company: '1000' });
    expect(out.dropped).toEqual(['product', 'secret', '__proto__', 'amount', 'company', 'name', 'month']);
    expect(Object.getPrototypeOf(out.values)).toBe(Object.prototype);
    expect(parse(`f.name=${'y'.repeat(201)}`).dropped).toEqual(['name']);
    expect(parse('f.company=').values).toEqual({});
    const proto = parse('f.constructor=x&f.toString=y');
    expect(proto.values).toEqual({});
    expect(proto.dropped).toEqual(['constructor', 'toString']);
    expect(Object.getPrototypeOf(proto.values)).toBe(Object.prototype);
  });
  it('reads a page selection: s.* wins over f.*', () => {
    const out = urlSelection(new URLSearchParams('f.company=1000&s.company=2000&f.month=02&s.year=2026'), fields, {});
    expect(out).toEqual({ values: { company: '2000', month: '02', year: '2026' }, dropped: [], given: true });
    expect(urlSelection(new URLSearchParams('s='), fields, {}).given).toBe(true);
    expect(urlSelection(new URLSearchParams('hl=A'), fields, {}).given).toBe(false);
  });
});

describe('drill URLs', () => {
  it('builds selection, drill and open links; a bad from is left out', () => {
    expect(selectionParams({ company: '1000', month: '01', year: '' }).toString()).toBe('s.company=1000&s.month=01');
    expect(pageWith('/samples/x', { company: '1000', month: '01', year: '2026' }, { hl: 'A:01' })).toBe('/samples/x?s.company=1000&s.month=01&s.year=2026&hl=A%3A01');
    expect(pageWith('/samples/x', {})).toBe('/samples/x?s=');
    expect(drillHref('/samples/deals', { product: '51A', currency: 'INR' }, '/samples/liquidity-statement?s.company=1000&hl=A:01'))
      .toBe('/samples/deals?f.product=51A&f.currency=INR&from=%2Fsamples%2Fliquidity-statement%3Fs.company%3D1000%26hl%3DA%3A01');
    expect(drillHref('/samples/deals', { product: '51A' }, '//evil.com')).toBe('/samples/deals?f.product=51A');
    expect(openHref('/samples/deals', '0000010001', '/samples/cash-flow-lines?s.month=01')).toBe('/samples/deals?open=0000010001&from=%2Fsamples%2Fcash-flow-lines%3Fs.month%3D01');
  });
  it('carries the display unit (u) on a drill after from', () => {
    expect(drillHref('/samples/liquidity-statement', { company: '1000' }, '/samples/treasury-overview?s.company=1000&u=CRORES', { u: 'CRORES' }))
      .toBe('/samples/liquidity-statement?f.company=1000&from=%2Fsamples%2Ftreasury-overview%3Fs.company%3D1000%26u%3DCRORES&u=CRORES');
  });
  it('knows when Run would send the same request again', () => {
    expect(urlRunOf({ company: '', month: '01', year: '2026' })).toEqual({ month: '01', year: '2026' });
    const back = new URLSearchParams(selectionParams({ company: '', month: '01', year: '2026' }));
    expect(JSON.stringify(urlSelection(back, [{ field: 'company', label: 'Company Code', type: 'code', max: 4 }, { field: 'month', label: 'Period', type: 'period', yearField: 'year' }], {}).values))
      .toBe(JSON.stringify(urlRunOf({ company: '', month: '01', year: '2026' })));
  });
  it('reads the breakdown stack and refuses anything malformed', () => {
    expect(drillStack('[{"row":"A","column":"b1"},{"row":"A:01","column":null}]')).toEqual([{ row: 'A', column: 'b1' }, { row: 'A:01', column: null }]);
    for (const bad of [null, '', 'x', '{}', '[{"row":1}]', '[{"row":"A","column":5}]', JSON.stringify(Array.from({ length: 11 }, () => ({ row: 'A', column: null })))]) expect(drillStack(bad)).toEqual([]);
  });
});

describe('display unit from the URL (u)', () => {
  const units = DEFAULT_UNITS;
  it('starts in a valid u, drops an unknown one, and keeps a user pick until the URL names another unit', () => {
    expect(shownUnit(units, 'CRORES', { id: 'CRORES', seen: 'CRORES' })).toEqual({ unit: units[3], dropped: false });
    expect(shownUnit(units, 'MILLIONS', { id: 'LAKHS', seen: 'MILLIONS' })).toEqual({ unit: units[2], dropped: true });
    expect(shownUnit(units, '', { id: 'LAKHS', seen: null })).toEqual({ unit: units[2], dropped: false });
    // The user picked Lakhs while the URL said Crores: the pick wins; Run drops u from the URL: still Lakhs.
    expect(shownUnit(units, 'CRORES', { id: 'LAKHS', seen: 'CRORES' }).unit.id).toBe('LAKHS');
    expect(shownUnit(units, null, { id: 'LAKHS', seen: 'CRORES' }).unit.id).toBe('LAKHS');
    // A new drill or way back names another unit: the URL wins.
    expect(shownUnit(units, 'THOUSANDS', { id: 'LAKHS', seen: 'CRORES' }).unit.id).toBe('THOUSANDS');
    expect(shownUnit([units[2], units[3]], 'ABSOLUTE', { id: 'LAKHS', seen: 'ABSOLUTE' })).toEqual({ unit: units[2], dropped: true });
  });
});
