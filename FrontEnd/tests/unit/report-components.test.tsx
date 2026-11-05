import { renderToStaticMarkup as renderReactMarkup } from 'react-dom/server';
import { businessMarkup } from '../support/table-markup';
const renderToStaticMarkup = (node: Parameters<typeof renderReactMarkup>[0]) => businessMarkup(renderReactMarkup(node));
import { describe, expect, it } from 'vitest';
import { fromInfo } from '@/components/report/DrillFromBar';
import { ReportGrid } from '@/components/report/ReportGrid';
import type { Row } from '@/lib/grid/types';
import { DEFAULT_UNITS, type FormattedReport, type RowStyle } from '@/lib/report/types';

const STYLE: Record<string, RowStyle> = { H: 'heading', P: 'percent' };
const report: FormattedReport = {
  variant: 'formatted', entity: 's', idField: 'id', idLabel: 'Group ID', parent: { by: 'prefix', separator: ':' }, style: r => STYLE[r.rowStyle] ?? 'normal',
  columns: [{ id: 'name', label: 'Group Name', type: 'text' }, { id: 'b1', label: '1–7 days', subHeader: 'B1', type: 'amount', drillable: true }]
};
const rows: Row[] = [{ id: 'A', name: 'Outflows', rowStyle: 'H', b1: '1234567.50' }, { id: 'A:01', name: 'Loans', rowStyle: '', b1: '0.00' }, { id: 'E', name: 'Ratio', rowStyle: 'P', b1: '-17.54' }];

describe('ReportGrid', () => {
  it('renders ALM row classes, the second header line, drill cells and the outlined row', () => {
    const html = renderToStaticMarkup(<ReportGrid title="Liquidity" report={report} rows={rows} unit={DEFAULT_UNITS[2]} drillable={(r, c) => c === null || r.rowStyle === 'H'} onDrill={() => {}} highlight="A:01" />);
    expect(html).toMatch(/<table\b[^>]*aria-label="Liquidity"/);
    expect(html).toContain('qr-table kit-data-table');
    expect(html).toContain('title="Sort Group ID">Group ID');
    expect(html).toContain('<tr class="qr-xbrl"><td class="md-id"></td><td></td><td class="md-amt">B1</td></tr>');
    expect(html).toContain('<tr data-row="A" class="qr-heading">');
    expect(html).toContain('<tr data-row="E" class="qr-percent">');
    expect(html).toContain('<td class="ds-code md-id qr-drilled"><button type="button" class="qr-drill">A:01</button></td>');
    expect(html).toContain('<td class="md-amt qr-drillable" tabindex="0">12.35</td>');
    expect(html).toContain('<td class="md-amt">-17.54 %</td>');
  });
  it('shows plain cells when nothing drills', () => {
    const html = renderToStaticMarkup(<ReportGrid title="Liquidity" report={report} rows={rows} unit={DEFAULT_UNITS[0]} />);
    expect(html).not.toContain('qr-drill');
    expect(html).toContain('<td class="ds-code md-id">A</td>');
  });
});

describe('the from bar', () => {
  it('names the screen and its selection, and the way back', () => {
    expect(fromInfo('/samples/monthly-amounts?s.company=1000&s.month=01&s.year=2026')).toEqual({ text: 'Monthly Amounts · 1000 - Demo India Ltd · 01-2026', back: 'Back to Monthly Amounts' });
    expect(fromInfo('/nope/x?s.a=1')).toEqual({ text: '/nope/x', back: 'Back' });
  });
});
