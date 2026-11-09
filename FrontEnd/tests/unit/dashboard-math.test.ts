import { describe, expect, it } from 'vitest';
import { axisLabel, barPath, chartTicks, donutArcs, niceTicks, polylinePoints, tickDecimals, yScale } from '@/lib/dashboard/charts';
import { limitShare, monthLabel, periodsOf, previousPeriod, quarterLabel, RAG_LABEL, ragOf } from '@/lib/dashboard/periods';
import { dataKindOf, defaultRange, rangesOf } from '@/lib/dashboard/types';

const ym = (ps: { month: string; year: string }[]) => ps.map(p => `${p.year}-${p.month}`);

describe('periods', () => {
  it('labels months and quarters of a financial year', () => {
    expect(monthLabel('01', '2026')).toBe('Jan 26');
    expect(quarterLabel('03', '2025', 4)).toBe('Q4 FY25');
    expect(quarterLabel('06', '2025', 4)).toBe('Q1 FY26');
    expect(quarterLabel('12', '2025', 4)).toBe('Q3 FY26');
    expect(quarterLabel('03', '2025', 1)).toBe('Q1 FY25');
    expect(previousPeriod('01', '2026')).toEqual({ month: '12', year: '2025' });
  });
  it('lists the months of a range up to the selected month', () => {
    expect(ym(periodsOf('01', '2026', '3m'))).toEqual(['2025-11', '2025-12', '2026-01']);
    expect(ym(periodsOf('01', '2026', '6m', 4))).toEqual(['2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01']);
    expect(periodsOf('01', '2026', '12m')).toHaveLength(12);
  });
  it('lists the last four quarter-end months by the quarter start', () => {
    expect(ym(periodsOf('01', '2026', '4q', 4))).toEqual(['2025-03', '2025-06', '2025-09', '2025-12']);
    expect(ym(periodsOf('03', '2026', '4q', 4))).toEqual(['2025-06', '2025-09', '2025-12', '2026-03']);
    expect(ym(periodsOf('02', '2026', '4q', 1))).toEqual(['2025-03', '2025-06', '2025-09', '2025-12']);
  });
  it('rates a mismatch % against its limit: amber from 80 % of the limit, red beyond it', () => {
    expect([ragOf(-17.54, 15), ragOf(-9.69, 10), ragOf(-8, 10), ragOf(-5.77, 10), ragOf(1.89, 10)]).toEqual(['red', 'amber', 'amber', 'green', 'green']);
    expect(RAG_LABEL).toEqual({ green: 'Within limit', amber: 'Near limit', red: 'Breach' });
  });
  it('knows the ranges and data of each section kind', () => {
    expect(rangesOf({ kind: 'bars', id: 'g', title: 'G' })).toEqual(['3m', '6m', '12m', '4q']);
    expect(defaultRange({ kind: 'line', id: 'l', title: 'L', ranges: ['3m', '4q'] })).toBe('3m');
    expect(defaultRange({ kind: 'donut', id: 'd', title: 'D' })).toBeNull();
    expect([dataKindOf({ kind: 'tiles', id: 't' }), dataKindOf({ kind: 'line', id: 'l', title: 'L' }), dataKindOf({ kind: 'donut', id: 'd', title: 'D' }), dataKindOf({ kind: 'table', id: 's', title: 'S' })])
      .toEqual(['tiles', 'series', 'slices', 'table']);
  });
});

describe('chart math', () => {
  it('rounds ticks to 1, 2, 2.5 or 5 times a power of ten and leaves headroom', () => {
    expect(niceTicks(0, 100)).toEqual([0, 25, 50, 75, 100]);
    expect(niceTicks(-17.72, 1.89)).toEqual([-20, -15, -10, -5, 0, 5]);
    expect(chartTicks([-17.72, -13.67, -9.69, -5.77, -1.91, 1.89], -10)).toEqual([-30, -20, -10, 0, 10]);
    expect(chartTicks([])).toEqual([0]);
    const y = yScale([-30, -20, -10, 0, 10], 12, 132);
    expect([y(10), y(0), y(-30)]).toEqual([12, 45, 144]);
  });
  it('gives ticks without float noise (small percents)', () => {
    const ticks = niceTicks(0, 0.7);
    expect(ticks).toEqual([0, 0.2, 0.4, 0.6, 0.8]);
    expect(ticks.map(t => axisLabel(t, ticks))).toEqual(['0.0', '0.2', '0.4', '0.6', '0.8']);
  });
  it('labels an amount axis in the unit with the decimals its step needs (Crores of a lakh-sized series are not all 0)', () => {
    const ticks = chartTicks([650000, 420000, 380000]);
    expect(ticks).toEqual([0, 200000, 400000, 600000, 800000]);
    expect(ticks.map(t => axisLabel(t, ticks, 10000000))).toEqual(['0.00', '0.02', '0.04', '0.06', '0.08']);
    expect(ticks.map(t => axisLabel(t, ticks, 100000))).toEqual(['0', '2', '4', '6', '8']);
    expect(ticks.map(t => axisLabel(t, ticks))).toEqual(['0', '200,000', '400,000', '600,000', '800,000']);
    expect(tickDecimals([0, 2.5, 5], 1)).toBe(1);
    expect(tickDecimals([-20, -10, 0, 10], 1)).toBe(0);
  });
  it('shares of a limit: the same sign convention as the chart limit line', () => {
    expect(limitShare('-17.54', '-15.00')).toBeCloseTo(116.93, 2);
    expect(limitShare('1.89', '-10.00')).toBe(0);
    expect(limitShare('-8.40', '-10.00')).toBeCloseTo(84, 6);
    expect(limitShare('80', '100')).toBe(80);
    expect(limitShare('5', '0')).toBe(0);
  });
  it('draws bars rounded away from zero and flat when tiny', () => {
    expect(barPath(10, 20, 100, 60)).toBe('M10,100V64Q10,60 14,60H26Q30,60 30,64V100Z');
    expect(barPath(10, 20, 100, 140)).toBe('M10,100V136Q10,140 14,140H26Q30,140 30,136V100Z');
    expect(barPath(10, 20, 100, 100.2)).toBe('M10,100h20');
    expect(polylinePoints([{ x: 1, y: 2 }, { x: 3.456, y: 4 }])).toBe('1,2 3.46,4');
  });
  it('splits a donut by share, starting at the top; one slice is a full ring', () => {
    const halves = donutArcs([1, 1], 80, 80, 50, 70);
    expect(halves.map(a => a.share)).toEqual([0.5, 0.5]);
    expect(halves[0].d).toBe('M80,10 A70,70 0 0 1 80,150 L80,130 A50,50 0 0 0 80,30 Z');
    expect(halves[1].d).toBe('M80,150 A70,70 0 0 1 80,10 L80,30 A50,50 0 0 0 80,130 Z');
    expect(donutArcs([0, 2], 80, 80, 50, 70)).toEqual([
      { d: '', share: 0 },
      { d: 'M80,10 A70,70 0 0 1 80,150 A70,70 0 0 1 80,10 L80,30 A50,50 0 0 0 80,130 A50,50 0 0 0 80,30 Z', share: 1 }
    ]);
  });
});
