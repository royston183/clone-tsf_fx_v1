// src/components/gallery/LayoutsSection.tsx
import { useState } from 'react';
import { AlvGrid } from '@/components/report/AlvGrid';
import { LayoutControls } from '@/components/report/LayoutControls';
import { Toast, useToast } from '@/components/ui/Toast';
import type { ActiveLayout, AlvLayout } from '@/lib/client/use-layouts';
import type { Row } from '@/lib/grid/types';
import { alvModel, normalizeLayout, reportLayoutTarget, toggleKey } from '@/lib/layout/layout';
import { DEFAULT_UNITS, type LayoutState, type ReportColumn, type SavedLayout } from '@/lib/report/types';
import { galleryItem } from './ids';

const COLUMNS: ReportColumn[] = [
  { id: 'company', label: 'Company Code', type: 'code' },
  { id: 'counterparty', label: 'Counterparty', type: 'code', textField: 'cpName' },
  { id: 'payDate', label: 'Payment Date', type: 'date' },
  { id: 'amount', label: 'Amount', type: 'amount', currencyField: 'currency' },
  { id: 'currency', label: 'Currency', type: 'code' }
];
const STANDARD: LayoutState = { columns: ['company', 'counterparty', 'payDate', 'amount', 'currency'], sort: [{ col: 'payDate', desc: false }], subtotals: ['company'], unit: null, subtotalsOnly: false };
const TARGET = reportLayoutTarget(COLUMNS, STANDARD, {}, DEFAULT_UNITS.map(u => u.id));
const ROWS: Row[] = [
  { company: '1000', counterparty: 'CP001', cpName: 'Axis Finance', payDate: '2026-01-02', amount: '125000.00', currency: 'INR' },
  { company: '1000', counterparty: 'CP002', cpName: "O'Brien Capital", payDate: '2026-01-04', amount: '50000.00', currency: 'USD' },
  { company: '1000', counterparty: 'CP001', cpName: 'Axis Finance', payDate: '2026-01-09', amount: '80000.50', currency: 'INR' },
  { company: '2000', counterparty: 'CP003', cpName: 'Bharat Steel', payDate: '2026-01-05', amount: '240000.00', currency: 'INR' }
];
const SAVED: SavedLayout[] = [
  { name: 'By counterparty', description: 'Subtotals per company and counterparty', scope: 'shared', isDefault: true, layout: { ...STANDARD, subtotals: ['company', 'counterparty'] }, changedBy: 'DEMO', changedOn: '2026-10-12T09:00:00.000Z' },
  { name: 'Totals only', description: 'Subtotal lines only', scope: 'personal', isDefault: false, layout: { ...STANDARD, subtotalsOnly: true }, changedBy: 'DEMO', changedOn: '2026-10-12T09:00:00.000Z' }
];

/** D-layout: the ALV picker and dialogs on sample lines; saving here keeps the layout in this page only. */
export function LayoutsSection() {
  const [layouts, setLayouts] = useState<SavedLayout[]>(SAVED);
  const [state, setState] = useState<{ active: ActiveLayout | null; draft: LayoutState; modified: boolean }>({ active: { name: SAVED[0].name, scope: 'shared' }, draft: SAVED[0].layout, modified: false });
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [toast, notify] = useToast();
  const layout = normalizeLayout(state.draft, TARGET);
  const apply = (draft: LayoutState, active: ActiveLayout | null, modified: boolean) => { setState({ active, draft, modified }); setCollapsed(new Set()); };
  const alv: AlvLayout = {
    layout, active: state.active, modified: state.modified, layouts, error: '', ready: true,
    select: saved => apply(saved ? saved.layout : STANDARD, saved ? { name: saved.name, scope: saved.scope } : null, false),
    change: next => apply(next, state.active, true),
    save: async (meta, next) => {
      setLayouts(list => [...list.filter(l => !(l.scope === meta.scope && l.name.toLowerCase() === meta.name.toLowerCase())), { ...meta, layout: next, changedBy: 'DEMO', changedOn: new Date().toISOString() }]);
      apply(next, { name: meta.name, scope: meta.scope }, false);
      notify(`Layout “${meta.name}” saved in this page only`, 'success');
    },
    remove: async () => {
      const active = state.active;
      if (!active) return;
      setLayouts(list => list.filter(l => !(l.scope === active.scope && l.name === active.name)));
      apply(STANDARD, null, false);
    }
  };
  const sort = (col: string) => alv.change({ ...layout, sort: [{ col, desc: layout.sort[0]?.col === col ? !layout.sort[0].desc : false }] });
  return (
    <section className="kit-gallery" aria-labelledby="g-layouts"><h2 id="g-layouts">Layouts</h2>
      <div className="kit-gallery-grid">
        <article className="panel kit-gallery-item" data-gallery-id="D-layout">
          <h3><span className="kit-id">D-layout</span>{galleryItem('D-layout').title}</h3>
          <p className="muted">Picker (Standard, shared, My layouts; * when changed), Change Layout (columns, sort, subtotals, display) and Save Layout (shared or only me, default).</p>
          <div className="ds-actions"><LayoutControls alv={alv} target={TARGET} units={DEFAULT_UNITS} canShare /></div>
          <AlvGrid title="Sample lines" model={alvModel(COLUMNS, layout, ROWS, collapsed)} layout={layout} unit={DEFAULT_UNITS[0]} onSort={sort} onToggle={key => setCollapsed(c => toggleKey(c, key))} />
        </article>
      </div>
      <Toast toast={toast} />
    </section>
  );
}
