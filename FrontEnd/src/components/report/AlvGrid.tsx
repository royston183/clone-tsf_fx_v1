import { DataTable, columnsFor } from '@/components/table/DataTable';
import { StatusValue } from '@/components/ui/StatusValue';
// src/components/report/AlvGrid.tsx
import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { Row } from '@/lib/grid/types';
import type { Total } from '@/lib/items/totals';
import { subtotalLabel, type AlvModel } from '@/lib/layout/layout';
import { cellText } from '@/lib/report/report';
import type { LayoutState, ReportColumn, Unit } from '@/lib/report/types';
import { formatInUnit } from '@/lib/report/units';
import { SortTh } from '@/components/ui/SortTh';

export interface AlvGridProps {
  nativeLayout?: boolean;
  nativeExport?: boolean;
  title: string;
  model: AlvModel;
  layout: LayoutState;
  unit: Unit;
  onSort: (column: string) => void;
  onToggle: (key: string) => void;
  /** Clicking a detail line opens it (line-item reports with `open`). */
  onOpen?: (row: Row) => void;
}

const cls = (c: ReportColumn) => (c.type === 'amount' || c.type === 'percent' || c.type === 'rate' ? 'md-amt' : c.type === 'code' ? 'ds-code' : undefined);

/** An SAP ALV list (spec §3.3, ALM .trm-table): the layout's columns and sort, nested subtotal lines per currency, totals. */
export function AlvGrid({ title, model, layout, unit, onSort, onToggle, onOpen, nativeLayout = false, nativeExport = false }: AlvGridProps) {
  const { visible, grid, totals } = model;
  const firstAmount = visible.findIndex(c => c.type === 'amount');
  const span = firstAmount < 0 ? visible.length : firstAmount;
  const currencyCols = new Set(visible.filter(c => c.type === 'amount' && c.currencyField).map(c => c.currencyField as string));
  // Without a visible currency column after the label, a sum line names its currency in the label.
  const curInLabel = !visible.slice(span).some(c => currencyCols.has(c.id));
  const withCur = (t: Total | undefined) => (curInLabel && t?.currency ? <small>{t.currency}</small> : null);
  const sort = layout.sort[0] ? { col: layout.sort[0].col, dir: (layout.sort[0].desc ? -1 : 1) as 1 | -1 } : { col: null, dir: 1 as const };
  /** A subtotal or total line: the label spans the columns before the first amount; amounts and currency per currency. */
  const sumCells = (label: ReactNode, t: Total | undefined) => <>
    {span > 0 && <td colSpan={span} className="trm-sum-label">{label}</td>}
    {visible.slice(span).map(c => {
      if (c.type === 'amount') return <td key={c.id} className="md-amt">{t ? formatInUnit(t.sums[c.id] ?? '0.00', unit) : ''}</td>;
      if (currencyCols.has(c.id)) return <td key={c.id}>{t?.currency ?? ''}</td>;
      return <td key={c.id} />;
    })}
  </>;
  return (
    <div className="table-wrap ds-table-wrap md-wrap">
      <DataTable nativeLayout={nativeLayout} nativeExport={nativeExport} columns={columnsFor(visible)} className="ds-table md-table trm-table" aria-label={title}>
        <thead><tr>{visible.map(c => <SortTh key={c.id} col={c.id} sort={sort} onSort={onSort} className={cls(c)}>{c.label}</SortTh>)}</tr></thead>
        <tbody>{grid.map((line, i) => {
          if (line.type === 'row') {
            const r = line.row;
            return (
              <tr key={`r${i}`} className={onOpen ? 'kit-row-open' : undefined} tabIndex={onOpen ? 0 : undefined}
                onClick={onOpen ? () => onOpen(r) : undefined} onKeyDown={onOpen ? e => { if (e.key === 'Enter') { e.preventDefault(); onOpen(r); } } : undefined}>
                {visible.map(c => <td key={c.id} className={cls(c)}><StatusValue definition={c} row={r}>{cellText(c, r, unit)}</StatusValue></td>)}
              </tr>
            );
          }
          const folded = line.collapsed || layout.subtotalsOnly;
          return (line.totals.length ? line.totals : [undefined]).map((t, k) => (
            <tr key={`${line.key}|${k}`} className={`trm-sub trm-sub-${Math.min(line.level, 2)}`}>
              {sumCells(k === 0
                ? <button type="button" className="trm-sub-toggle" aria-expanded={!folded} disabled={layout.subtotalsOnly} onClick={() => onToggle(line.key)}>
                    {folded ? <ChevronRight size={13} /> : <ChevronDown size={13} />}<span className="trm-stars">{'*'.repeat(line.level + 1)}</span>{subtotalLabel(line)}{withCur(t)}<small>{`${line.count} ${line.count === 1 ? 'row' : 'rows'}`}</small>
                  </button>
                : <span className="trm-sum-pin">{withCur(t)}</span>, t)}
            </tr>
          ));
        })}</tbody>
        <tfoot>{(totals.length ? totals : [undefined]).map((t, k) => <tr key={`t${k}`}>{sumCells(<>Total{withCur(t)}</>, t)}</tr>)}</tfoot>
      </DataTable>
    </div>
  );
}
