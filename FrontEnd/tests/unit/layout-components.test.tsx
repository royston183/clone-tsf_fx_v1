// tests/unit/layout-components.test.tsx
import { renderToStaticMarkup as renderReactMarkup } from 'react-dom/server';
import { businessMarkup } from '../support/table-markup';
const renderToStaticMarkup = (node: Parameters<typeof renderReactMarkup>[0]) => businessMarkup(renderReactMarkup(node));
import { describe, expect, it } from 'vitest';
import { AlvGrid } from '@/components/report/AlvGrid';
import { LayoutControls } from '@/components/report/LayoutControls';
import { LayoutPicker } from '@/components/report/LayoutPicker';
import type { Row } from '@/lib/grid/types';
import type { AlvLayout } from '@/lib/client/use-layouts';
import { alvModel, reportLayoutTarget } from '@/lib/layout/layout';
import { DEFAULT_UNITS, type LayoutState, type ReportColumn, type SavedLayout } from '@/lib/report/types';

const columns: ReportColumn[] = [
  { id: 'company', label: 'Company Code', type: 'code' },
  { id: 'counterparty', label: 'Counterparty', type: 'code', textField: 'cpName' },
  { id: 'payDate', label: 'Payment Date', type: 'date' },
  { id: 'amount', label: 'Amount', type: 'amount', currencyField: 'currency' },
  { id: 'currency', label: 'Currency', type: 'code' }
];
const rows: Row[] = [
  { company: '2000', counterparty: 'CP002', cpName: "O'Brien Capital", payDate: '2026-01-05', amount: '100.10', currency: 'INR' },
  { company: '1000', counterparty: 'CP001', cpName: 'Axis Finance', payDate: '2026-01-03', amount: '0.10', currency: 'INR' },
  { company: '1000', counterparty: 'CP001', cpName: 'Axis Finance', payDate: '2026-01-02', amount: '0.20', currency: 'INR' },
  { company: '1000', counterparty: 'CP002', cpName: "O'Brien Capital", payDate: '2026-01-04', amount: '50.00', currency: 'USD' },
  { company: '1000', counterparty: 'CP001', cpName: 'Axis Finance', payDate: '2026-01-01', amount: '25.00', currency: 'USD' }
];
const layout: LayoutState = { columns: ['company', 'counterparty', 'amount', 'currency'], sort: [{ col: 'payDate', desc: false }], subtotals: ['company', 'counterparty'], unit: null, subtotalsOnly: false };
const saved = (name: string, scope: 'shared' | 'personal', isDefault = false): SavedLayout => ({ name, description: '', scope, isDefault, layout, changedBy: 'X', changedOn: '' });

describe('AlvGrid', () => {
  it('renders nested subtotal lines and one total line per currency', () => {
    const html = renderToStaticMarkup(<AlvGrid title="Lines" model={alvModel(columns, layout, rows)} layout={layout} unit={DEFAULT_UNITS[0]} onSort={() => {}} onToggle={() => {}} />);
    expect(html).toMatch(/<table\b[^>]*aria-label="Lines"/);
    expect(html).toContain('trm-table kit-data-table');
    expect(html).toContain('<span class="trm-stars">**</span>Counterparty: CP001 - Axis Finance<small>3 rows</small>');
    expect(html).toContain('<span class="trm-stars">*</span>Company Code: 1000<small>4 rows</small>');
    expect((html.match(/<tr class="trm-sub trm-sub-0">/g) ?? []).length).toBe(3);
    expect(html).toMatch(/<tfoot>.*Total.*100\.40.*INR.*Total.*75\.00.*USD.*<\/tfoot>/s);
    expect(html).toContain('<td class="ds-code">CP001 - Axis Finance</td>');
  });
});

describe('LayoutPicker', () => {
  it('lists the Standard layout, shared layouts and My layouts, and marks a changed view', () => {
    const html = renderToStaticMarkup(<LayoutPicker layouts={[saved('By company', 'shared', true), saved('Mine', 'personal')]} active={{ name: 'Mine', scope: 'personal' }} modified onSelect={() => {}} />);
    expect(html).toContain('>Standard layout</option>');
    expect(html).toContain('>By company (default)</option>');
    expect(html).toContain('<optgroup label="My layouts">');
    expect(html).toContain('>Mine *</option>');
  });
});

describe('LayoutControls', () => {
  const target = reportLayoutTarget(columns, layout, {}, ['ABSOLUTE']);
  const alv = (active: AlvLayout['active']): AlvLayout => ({
    layout, active, modified: false, layouts: [saved('Team', 'shared'), saved('Mine', 'personal')], error: '', ready: true,
    select: () => {}, change: () => {}, save: async () => {}, remove: async () => {}
  });
  const html = (active: AlvLayout['active'], canShare: boolean) => renderToStaticMarkup(<LayoutControls alv={alv(active)} target={target} units={null} canShare={canShare} />);
  it('offers Delete on a shared layout only to those who may share; a personal layout always', () => {
    expect(html({ name: 'Team', scope: 'shared' }, false)).not.toContain('aria-label="Delete layout"');
    expect(html({ name: 'Team', scope: 'shared' }, true)).toContain('aria-label="Delete layout"');
    expect(html({ name: 'Mine', scope: 'personal' }, false)).toContain('aria-label="Delete layout"');
    expect(html(null, true)).not.toContain('aria-label="Delete layout"');
  });
});
