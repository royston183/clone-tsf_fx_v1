import { describe, expect, it } from 'vitest';
import { columnsFor, fitTableColumns, type MeasuredColumn } from '@/lib/grid/table-layout';

const columns: MeasuredColumn[] = [
  { kind: 'flag', contentWidth: 20, headerWidth: 24 },
  { kind: 'code', contentWidth: 84, headerWidth: 80 },
  { kind: 'text', contentWidth: 320, headerWidth: 140 },
  { kind: 'date', contentWidth: 120, headerWidth: 120 },
  { kind: 'amount', contentWidth: 148, headerWidth: 140 }
];

describe('shared table column plan', () => {
  it('shares schema-derived alignment and widths between headings, data and totals', () => {
    expect(columnsFor([{ field: 'value' }, { field: 'when' }, { field: 'flag' }], [
      { field: 'value', label: 'Value', type: 'amount', width: 175 }, { field: 'when', label: 'Date', type: 'date' }, { field: 'flag', label: 'Flag', type: 'flag' }
    ])).toEqual([{ kind: 'amount', align: 'right', width: 175 }, { kind: 'date', align: 'left', width: undefined }, { kind: 'flag', align: undefined, width: undefined }]);
    expect(fitTableColumns(columns, 900).map(c => c.align)).toEqual(['center', 'left', 'left', 'left', 'right']);
  });
  it('gives spare space to descriptions first, while dates, codes and numbers stay compact', () => {
    const plan = fitTableColumns(columns, 752);
    expect(plan.map(c => c.width)).toEqual([40, 84, 360, 120, 148]);
  });
  it('spans the whole container once descriptions are full width, sharing the rest by width (flags and pinned widths stay)', () => {
    const plan = fitTableColumns(columns, 1600);
    expect(plan.reduce((sum, c) => sum + c.width, 0)).toBe(1600);
    expect(plan[0].width).toBe(40);
    expect(plan.slice(1).every((c, i) => c.width > [84, 360, 120, 148][i])).toBe(true);
    const pinned = fitTableColumns([{ kind: 'code', width: 90, contentWidth: 80, headerWidth: 60 }, { kind: 'date', contentWidth: 120, headerWidth: 120 }], 1000);
    expect(pinned.map(c => c.width)).toEqual([90, 910]);
    // A fractional container never yields a table wider than it (no horizontal scrollbar).
    expect(fitTableColumns(columns, 1599.6).reduce((sum, c) => sum + c.width, 0)).toBe(1599);
  });
  it('retains the full single-line data width and scrolls instead of wrapping descriptions', () => {
    const fit = fitTableColumns(columns, 650);
    expect(fit.reduce((sum, c) => sum + c.width, 0)).toBeGreaterThan(650);
    expect(fit[2].width).toBeGreaterThanOrEqual(320);
    const narrow = fitTableColumns(columns, 320);
    expect(narrow.reduce((sum, c) => sum + c.width, 0)).toBeGreaterThan(320);
    expect(narrow[3].width).toBe(120);
    expect(narrow[4].width).toBeGreaterThanOrEqual(140);
    expect(fitTableColumns([{ kind: 'text', width: 250, contentWidth: 900, headerWidth: 90 }], 100)[0].width).toBe(900);
  });
  it('keeps complete identifiers and status badges wide enough instead of wrapping or clipping their values', () => {
    const fit = fitTableColumns([{ kind: 'code', contentWidth: 112, headerWidth: 70 }, { kind: 'status', contentWidth: 124, headerWidth: 70 }, { kind: 'text', contentWidth: 300, headerWidth: 90 }], 300);
    expect(fit[0].width).toBeGreaterThanOrEqual(112);
    expect(fit[1].width).toBeGreaterThanOrEqual(124);
    expect(fit.reduce((sum, c) => sum + c.width, 0)).toBeGreaterThan(300);
  });
});
