// The table of the FX custom pages: the shared DataTable with sortable headers, row selection and paging.
// Columns name their kind so amounts and rates align right and codes and dates stay compact.
import { useMemo, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { DataTable, type TableColumn } from '@/components/table/DataTable';
import { SortTh } from '@/components/ui/SortTh';
import type { SortState } from '@/lib/grid/types';

export type FxKind = 'text' | 'code' | 'date' | 'amount' | 'rate' | 'number' | 'status' | 'actions';
export interface FxColumn<R> {
  id: string;
  label: string;
  kind?: FxKind;
  /** The value sorted on (and shown, unless `render` is given). */
  value: (row: R) => string | number | null | undefined;
  render?: (row: R) => ReactNode;
  sortable?: boolean;
  /** A floor for the column's width (status tags and buttons default to one, so they never wrap). */
  minWidth?: number;
}

const tableKind = (k: FxKind = 'text'): TableColumn['kind'] =>
  k === 'rate' ? 'number' : k === 'actions' ? 'actions' : k;
const side = (k: FxKind = 'text') => (k === 'amount' || k === 'rate' || k === 'number' ? 'kit-num' : k === 'code' ? 'ds-code' : '');

export function FxTable<R>({ columns, rows, rowKey, select = 'none', picked, onPick, onOpen, rowClass, empty, pageSizes = [20, 50, 100], defaultSort, label }: {
  columns: FxColumn<R>[];
  rows: R[];
  rowKey: (row: R) => string;
  select?: 'none' | 'single' | 'multi';
  picked?: string[];
  onPick?: (keys: string[]) => void;
  /** Double-click or Enter on a row. */
  onOpen?: (row: R) => void;
  rowClass?: (row: R) => string;
  empty: ReactNode;
  pageSizes?: number[];
  defaultSort?: SortState;
  label: string;
}) {
  const [sort, setSort] = useState<SortState>(defaultSort ?? { col: '', dir: 1 });
  const [size, setSize] = useState(pageSizes[0]);
  const [page, setPage] = useState(1);
  const chosen = new Set(picked ?? []);

  const sorted = useMemo(() => {
    const col = columns.find(c => c.id === sort.col);
    if (!col) return rows;
    return [...rows].sort((a, b) => {
      const x = col.value(a), y = col.value(b);
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * sort.dir;
      return String(x ?? '').localeCompare(String(y ?? ''), 'en', { numeric: true }) * sort.dir;
    });
  }, [rows, columns, sort]);
  const last = Math.max(1, Math.ceil(sorted.length / size));
  const current = Math.min(page, last);
  const shown = sorted.slice((current - 1) * size, current * size);

  const toggle = (key: string) => {
    if (!onPick) return;
    if (select === 'single') onPick(chosen.has(key) ? [] : [key]);
    else onPick(chosen.has(key) ? [...chosen].filter(k => k !== key) : [...chosen, key]);
  };
  const allOn = shown.length > 0 && shown.every(r => chosen.has(rowKey(r)));
  const onSort = (col: string) => { setPage(1); setSort(s => ({ col, dir: s.col === col ? (s.dir === 1 ? -1 : 1) : 1 })); };

  return (
    <div className="tsf-table">
      <div className="table-wrap ds-table-wrap">
        <DataTable aria-label={label} className="ds-table" columns={[...(select !== 'none' ? [{ kind: 'flag' as const }] : []), ...columns.map(c => ({ kind: tableKind(c.kind), minWidth: c.minWidth ?? (c.kind === 'status' ? 170 : c.kind === 'actions' ? 96 : undefined) }))]}>
          <thead><tr>
            {select !== 'none' && <th className="ds-cb">{select === 'multi'
              ? <input type="checkbox" aria-label="Select all on this page" checked={allOn}
                  onChange={e => onPick?.(e.target.checked ? [...new Set([...chosen, ...shown.map(rowKey)])] : [...chosen].filter(k => !shown.some(r => rowKey(r) === k)))} />
              : <span className="sr-only">Select</span>}</th>}
            {columns.map(c => (c.kind === 'actions'
              ? <th key={c.id} className={side(c.kind) || undefined}>{c.label}</th>
              : <SortTh key={c.id} col={c.id} sort={sort} onSort={onSort} className={side(c.kind)}>{c.label}</SortTh>))}
          </tr></thead>
          <tbody>{shown.map(r => {
            const k = rowKey(r);
            return (
              <tr key={k} className={`${chosen.has(k) ? 'checked' : ''} ${onOpen ? 'kit-row-open' : ''} ${rowClass?.(r) ?? ''}`} tabIndex={0}
                onClick={() => toggle(k)} onDoubleClick={onOpen ? () => onOpen(r) : undefined}
                onKeyDown={e => { if (e.key === 'Enter' && onOpen) { e.preventDefault(); onOpen(r); } else if (e.key === ' ') { e.preventDefault(); toggle(k); } }}>
                {select !== 'none' && <td className="ds-cb" onClick={e => e.stopPropagation()}>
                  <input type="checkbox" aria-label={`Select ${k}`} checked={chosen.has(k)} onChange={() => toggle(k)} />
                </td>}
                {columns.map(c => <td key={c.id} className={side(c.kind)}>{c.render ? c.render(r) : (c.value(r) ?? '—')}</td>)}
              </tr>
            );
          })}</tbody>
        </DataTable>
        {!rows.length && <div className="empty"><Inbox size={24} />{empty}</div>}
      </div>
      {rows.length > 0 && <div className="kit-pager"><div className="pagination">
        <span>Showing {(current - 1) * size + 1}–{Math.min(current * size, sorted.length)} of {sorted.length}</span>
        <label className="kit-page-size">Rows
          <select aria-label="Rows per page" value={size} onChange={e => { setSize(Number(e.target.value)); setPage(1); }}>{pageSizes.map(n => <option key={n} value={n}>{n}</option>)}</select>
        </label>
        <button className="button secondary small" disabled={current <= 1} onClick={() => setPage(current - 1)}><ChevronLeft size={14} />Previous</button>
        <button className="button secondary small" disabled={current >= last} onClick={() => setPage(current + 1)}>Next<ChevronRight size={14} /></button>
      </div></div>}
    </div>
  );
}
