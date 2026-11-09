import { describe, expect, it } from 'vitest';
import type { AnyField } from '@/lib/fields';
import { matchColumns, templateHeadings, toFieldValues } from '@/lib/upload/columns';

const defs: AnyField[] = [
  { field: 'gl', label: 'GL Account *', type: 'code', key: true },
  { field: 'costCenter', label: 'Cost Center *', type: 'code', key: true },
  { field: 'month', label: 'Period *', type: 'period', yearField: 'year', key: true, required: true },
  { field: 'amount', label: 'Amount *', type: 'amount', required: true },
  { field: 'note', label: 'Note', type: 'text' }
];

describe('matchColumns', () => {
  it('matches headings by label or field name, ignoring case, spaces and the required star', () => {
    const out = matchColumns(defs, [
      { line: 1, cells: [] },
      { line: 2, cells: ['gl account', 'COSTCENTER', 'Period *', 'Period Year', 'Amount', 'Extra'] },
      { line: 3, cells: ['400100', 'CC10', 'April', '2026', '125,000.5', 'ignored'] },
      { line: 4, cells: ['', '', '', '', '', 'only extra'] }
    ]);
    expect(out.rows).toEqual([{ gl: '400100', costCenter: 'CC10', month: 'April', year: '2026', amount: '125,000.5', note: '' }]);
    expect(out.lines).toEqual([3]);
    expect(out.ignored).toEqual(['Extra']);
  });
  it('names a missing required column and points at the first worksheet', () => {
    expect(() => matchColumns(defs, [{ line: 1, cells: ['read me'] }])).toThrow('The file has no "GL Account", "Cost Center", "Period", "Period Year", "Amount" columns. The first row of the first worksheet must hold the column headings, as in the template.');
    expect(() => matchColumns(defs, [])).toThrow('The file is empty.');
  });
});

describe('toFieldValues and templateHeadings', () => {
  it('converts file text the way a paste from Excel is read, keeping unknown text for the check', () => {
    expect(toFieldValues(defs, { gl: '400100', costCenter: 'cc10', month: 'April', year: '2026', amount: '125,000.5', note: ' x ' }, {}))
      .toEqual({ gl: '400100', costCenter: 'CC10', month: '04', year: '2026', amount: '125000.50', note: 'x' });
    expect(toFieldValues(defs, { gl: '', costCenter: '', month: 'Smarch', year: '', amount: 'abc', note: '' }, {}).month).toBe('Smarch');
  });
  it('lists the template headings in field order', () => {
    expect(templateHeadings(defs)).toEqual(['GL Account', 'Cost Center', 'Period', 'Period Year', 'Amount', 'Note']);
  });
});
