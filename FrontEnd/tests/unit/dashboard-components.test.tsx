import { renderToStaticMarkup as renderReactMarkup } from 'react-dom/server';
import { businessMarkup } from '../support/table-markup';
const renderToStaticMarkup = (node: Parameters<typeof renderReactMarkup>[0]) => businessMarkup(renderReactMarkup(node));
import { describe, expect, it } from 'vitest';
import { plotScale } from '@/components/dashboard/BarChart';
import { BarChart } from '@/components/dashboard/BarChart';
import { DonutChart, DonutPie } from '@/components/dashboard/DonutChart';
import { KpiTile, meterText, tileValue } from '@/components/dashboard/KpiTile';
import { LineChart } from '@/components/dashboard/LineChart';
import { SummaryTable } from '@/components/dashboard/SummaryTable';
import { chartTicks } from '@/lib/dashboard/charts';
import type { TableData, Tile } from '@/lib/dashboard/types';
import { DEFAULT_UNITS } from '@/lib/report/types';
import { unitNote } from '@/lib/report/units';

const [ABSOLUTE, , LAKHS, CRORES] = DEFAULT_UNITS;
const red: Tile = { label: 'Mismatch up to 30 days', value: '-17.54', type: 'percent', meter: { value: '-17.54', limit: '-15.00' }, rag: 'red', delta: { value: '−2.10 pts vs last month', good: 'up' }, info: 'Limit −15 %.' };

describe('KpiTile', () => {
  it('renders the value, the meter, the RAG badge and the delta with ALM classes', () => {
    const html = renderToStaticMarkup(<KpiTile tile={red} unit={LAKHS} />);
    expect(html).toContain('class="panel ov-tile red"');
    expect(html).toContain('<b>-17.54 %</b>');
    expect(html).toContain('aria-valuenow="100"');
    expect(html).toContain('<small>117 % of limit used · limit -15.00 %</small>');
    expect(html).toContain('<span class="kit-status red"><span class="kit-status-dot" aria-hidden="true"></span>Breach</span>');
    expect(html).toContain('<small class="ov-delta down">−2.10 pts vs last month</small>');
    expect(html).toContain('aria-label="About Mismatch up to 30 days"');
    expect(renderToStaticMarkup(<KpiTile tile={{ ...red, rag: 'amber' }} unit={LAKHS} />)).toContain('<span class="kit-status amber"><span class="kit-status-dot" aria-hidden="true"></span>Near limit</span>');
    expect(renderToStaticMarkup(<KpiTile tile={{ ...red, rag: 'green' }} unit={LAKHS} />)).toContain('<span class="kit-status green"><span class="kit-status-dot" aria-hidden="true"></span>Within limit</span>');
  });
  it('formats amounts in the unit, counts and missing values; a drill makes the label a button', () => {
    // A scaled amount names its unit (246.00 INR in Lakhs would read as 246 rupees); Absolute needs no name.
    expect(tileValue({ label: 'Outflows', value: '24600000.00', type: 'amount', currency: 'INR' }, LAKHS)).toBe('246.00 Lakhs INR');
    expect(tileValue({ label: 'Outflows', value: '24600000.00', type: 'amount', currency: 'INR' }, CRORES)).toBe('2.46 Crores INR');
    expect(tileValue({ label: 'Outflows', value: '24600000.00', type: 'amount', currency: 'INR' }, ABSOLUTE)).toBe('2,46,00,000.00 INR');
    expect(tileValue({ label: 'Lines', value: '20', type: 'count' }, ABSOLUTE)).toBe('20');
    expect(tileValue({ label: 'Gap', value: '', type: 'percent' }, ABSOLUTE)).toBe('—');
    const linked = renderToStaticMarkup(<KpiTile tile={{ label: 'Lines', value: '20', type: 'count', drill: { kind: 'screen', module: 'sample-deals', filters: {}, label: 'Open' } }} unit={ABSOLUTE} onOpen={() => {}} />);
    expect(linked).toContain('class="panel ov-tile kit-tile-link"');
    expect(linked).toContain('<button type="button" class="ov-tile-k kit-tile-open">Lines</button>');
  });
});

describe('KpiTile meter', () => {
  it('shows the share of the limit used with the signed limit: 0 % while the mismatch is positive', () => {
    const green: Tile = { label: 'Mismatch 1–7 days', value: '1.89', type: 'percent', meter: { value: '1.89', limit: '-10.00' }, rag: 'green' };
    expect(meterText(green, LAKHS)).toBe('0 % of limit used · limit -10.00 %');
    expect(renderToStaticMarkup(<KpiTile tile={green} unit={LAKHS} />)).toContain('aria-valuenow="0"');
    expect(meterText({ ...green, value: '-8.40', meter: { value: '-8.40', limit: '-10.00' } }, LAKHS)).toBe('84 % of limit used · limit -10.00 %');
  });
  it('formats an amount limit in the unit with its currency', () => {
    const exposure: Tile = { label: 'Exposure', value: '8000000.00', type: 'amount', currency: 'INR', meter: { value: '8000000.00', limit: '10000000.00' } };
    expect(meterText(exposure, CRORES)).toBe('80 % of limit used · limit 1.00 Crores INR');
    expect(tileValue(exposure, CRORES)).toBe('0.80 Crores INR');
  });
});

describe('chart unit note', () => {
  const series = [{ name: 'Interest', points: [{ x: 'Jan 26', y: '650000.00' }] }];
  it('names the display unit of amount charts when it is not Absolute (ALM chart subtitle)', () => {
    expect(unitNote(LAKHS)).toBe('Amounts in Lakhs');
    expect(unitNote(ABSOLUTE)).toBe('');
    expect(renderToStaticMarkup(<LineChart label="Cash flows" series={series} format={v => v} axisFormat={t => String(t)} note="Amounts in Crores" />)).toContain('<figcaption>Amounts in Crores</figcaption>');
    expect(renderToStaticMarkup(<BarChart label="Gap" series={series} format={v => v} axisFormat={t => String(t)} note="Amounts in Lakhs" />)).toContain('<small>Amounts in Lakhs</small>');
    expect(renderToStaticMarkup(<DonutChart label="Mix" slices={[{ label: 'Bond', value: '100.00' }]} format={v => v} note="Amounts in Lakhs" />)).toContain('<figcaption>Amounts in Lakhs</figcaption>');
    expect(renderToStaticMarkup(<LineChart label="Cash flows" series={series} format={v => v} axisFormat={t => String(t)} />)).not.toContain('figcaption');
  });
});

describe('DonutChart and SummaryTable', () => {
  it('draws ALM\'s donut: one slice per value in the chart colours, the total in the middle, a legend with shares', () => {
    const html = renderToStaticMarkup(<DonutChart label="Mix" slices={[{ label: 'Term Loan', value: '300.00' }, { label: 'Bond', value: '100.00' }]} format={v => v} />);
    expect(html).toContain('<div class="ov-ch-pie">');
    expect((html.match(/<path class="ov-ch-c[12]"/g) ?? []).length).toBe(2);
    expect(html).toContain('class="ov-ch-pie-k">Total</text>');
    expect(html).toContain('class="ov-ch-pie-v">400.00</text>');
    expect(html).toContain('<i class="ov-ch-key ov-ch-c1"></i><span>Term Loan</span><b>300.00</b><small>75.0 %</small>');
    expect(html).not.toContain(' on"');
  });
  it('marks the hovered slice and its legend row "on" and shows that slice in the middle', () => {
    const slices = [{ label: 'Term Loan', value: '300.00' }, { label: 'Bond', value: '100.00' }];
    const html = renderToStaticMarkup(<DonutPie label="Mix" slices={slices} format={v => v} hover={1} onHover={() => {}} />);
    expect(html).toContain('<path class="ov-ch-c2 on"');
    expect(html).toContain('<path class="ov-ch-c1"');
    expect(html).toContain('<li class="on"><i class="ov-ch-key ov-ch-c2"></i><span>Bond</span>');
    expect(html).toContain('class="ov-ch-pie-k">Bond</text>');
    expect(html).toContain('class="ov-ch-pie-v">100.00</text>');
  });
  it('shows an empty state for no slices and for slices that are all zero', () => {
    expect(renderToStaticMarkup(<DonutChart label="Mix" slices={[]} format={v => v} />)).toContain('class="ov-tempty"');
    const zero = renderToStaticMarkup(<DonutChart label="Mix" slices={[{ label: 'Term Loan', value: '0.00' }, { label: 'Bond', value: '0.00' }]} format={v => v} />);
    expect(zero).toContain('class="ov-tempty"');
    expect(zero).not.toContain('<path');
  });
  it('shows the summary rows, bold mismatch rows, percents unscaled and drill buttons on drillable columns', () => {
    const data: TableData = {
      columns: [{ id: 'b1', label: '1–7 days' }, { id: 'total', label: 'Total' }],
      rows: [{ label: 'A. Outflows', cells: { b1: '1320000.00', total: '24600000.00' } }, { label: 'C. Mismatch', style: 'warn', cells: { b1: '-25000.00', total: '' } }, { label: 'E. %', style: 'percent', cells: { b1: '1.89', total: '' } }],
      drill: { b1: { lines: [{ label: 'Term loans', amount: '1320000.00' }] } }
    };
    const html = renderToStaticMarkup(<SummaryTable data={data} unit={LAKHS} onOpen={() => {}} />);
    expect(html).toContain('<button type="button" class="ov-bucket-btn" aria-expanded="false">1–7 days</button>');
    expect(html).toContain('<tr class="ov-strong">');
    expect(html).toContain('13.20');
    expect(html).toContain('1.89 %');
    expect(html).toContain('ov-neg-v');
  });
});

describe('plotScale (bar and line charts)', () => {
  it('puts the zero line at the bottom of the plot when every value is zero', () => {
    const ticks = chartTicks([0, 0, 0]);
    expect(ticks).toEqual([0]);
    expect(plotScale(ticks, 12, 132)(0)).toBe(144);
  });
  it('spans the ticks over the plot otherwise', () => {
    const y = plotScale([0, 50, 100], 12, 132);
    expect(y(100)).toBe(12);
    expect(y(0)).toBe(144);
    expect(y(50)).toBe(78);
  });
});

describe('KpiTile tags', () => {
  const base = { label: 'Cover', value: '5', type: 'count' as const };
  const meter = { value: '5', limit: '10' };
  for (const layout of [undefined, 'overview' as const]) {
    it(`words rag by meter, tag and absence (${layout ?? 'alm'})`, () => {
      const html = (tile: object) => renderToStaticMarkup(<KpiTile tile={{ ...base, ...tile }} unit={LAKHS} layout={layout} />);
      expect(html({ rag: 'amber', meter })).toContain('Near limit');
      expect(html({ rag: 'amber' })).toContain('Attention');
      expect(html({ rag: 'amber' })).not.toContain('Near limit');
      expect(html({ rag: 'red' })).toContain('Action needed');
      expect(html({ rag: 'green' })).toContain('On track');
      const tagged = html({ rag: 'green', tag: { label: 'Renewal due', tone: 'red' } });
      expect(tagged).toContain('kit-status red');
      expect(tagged).toContain('Renewal due');
      expect(tagged).not.toContain('On track');
      expect(html({})).not.toContain('kit-status');
    });
  }
});
