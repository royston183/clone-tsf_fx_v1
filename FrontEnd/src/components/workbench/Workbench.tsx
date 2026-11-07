import { DataTable, columnsFor } from '@/components/table/DataTable';
import { StatusValue } from '@/components/ui/StatusValue';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CalendarDays, ChevronDown, Database, Pencil, Plus, RefreshCw, RotateCcw, Search, Server, Trash2 } from 'lucide-react';
import { moduleView, onSampleData, SAMPLE_DATA_NOTE, sourceLabel } from '@/lib/client/data';
import { alignClass, alignOf } from '@/lib/fields';
import { columnValues, editValues, freshUi, keyOf, visibleRows } from '@/lib/grid/grid';
import { ariaSort, nextSort } from '@/lib/grid/sort';
import type { GridRow, Mode, Row, UiState, View } from '@/lib/grid/types';
import type { AnyModule } from '@/modules/registry';
import type { OpenMode } from '@/modules/types';
import { useWorkspace } from '@/components/shell/WorkspaceProvider';
import { LargeList } from '@/components/list/LargeList';
import { Notice } from '@/components/ui/Notice';
import { TrafficLightTag } from '@/components/ui/Badge';
import { SortIcon } from '@/components/ui/SortTh';
import { Toast, useToast } from '@/components/ui/Toast';
import { ColumnFilter } from './ColumnFilter';
import { DeleteConfirm } from './DeleteConfirm';
import { FilterCombo } from './FilterCombo';
import { entries, GridEditor, gridRow, type SavedView } from './GridEditor';

// Generic table-maintenance screen (ported from ALM src/pages/maintenance/Workbench.jsx). A module supplies its
// tabs, columns, grid, filters and checks; the server re-validates every change before it reaches SAP.
const records = (n: number) => `${n} ${n === 1 ? 'record' : 'records'}`;
// Last view per module and user: revisiting a screen shows it at once while SAP is re-read.
const viewCache = new Map<string, View>();
type ModalState = { kind: 'grid'; mode: Mode; frame: OpenMode; rows: GridRow[] } | { kind: 'delete'; rows: Row[] };

function storedTab(def: AnyModule): string {
  try {
    const id = localStorage.getItem(def.storageKey);
    return def.tabs.find(t => t.id === id)?.id ?? def.tabs[0].id;
  } catch {
    return def.tabs[0].id;
  }
}

export default function Workbench({ def }: { def: AnyModule }) {
  const { workspace } = useWorkspace();
  const cacheKey = `${workspace.session?.actingUser ?? ''}|${def.id}`;
  const [view, setViewState] = useState<View | null>(() => viewCache.get(cacheKey) ?? null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tabId, setTabId] = useState(() => storedTab(def));
  const [ui, setUi] = useState<Record<string, UiState>>(() => Object.fromEntries(def.tabs.map(t => [t.id, freshUi(t)])));
  const [modal, setModal] = useState<ModalState | null>(null);
  const [colFilter, setColFilter] = useState<{ field: string; anchor: HTMLElement } | null>(null);
  // Large tabs: ticked rows per tab (they come from the current page, not from the view) and a list version that a save bumps.
  const [picked, setPicked] = useState<Record<string, Row[]>>({});
  const [listVersion, setListVersion] = useState(0);
  const [toast, notify] = useToast();
  const setView = useCallback((v: View) => { viewCache.set(cacheKey, v); setViewState(v); }, [cacheKey]);
  const closeFilter = useCallback(() => setColFilter(null), []);

  const tab = def.tabs.find(t => t.id === tabId) ?? def.tabs[0];
  const state = ui[tab.id];
  const lk = useMemo(() => def.lookups(view?.lookups), [def, view]);
  const rows = useMemo(() => view?.tables[tab.id] ?? [], [view, tab.id]);
  const shown = useMemo(() => visibleRows(tab, rows, state), [tab, rows, state]);
  const byKey = useMemo(() => new Map(rows.map(r => [keyOf(tab, r), r])), [tab, rows]);
  const selected = state.selected.filter(k => byKey.has(k));
  const large = Boolean(tab.large && tab.list);
  const pickedRows = picked[tab.id] ?? [];
  const selectedRows = large ? pickedRows : selected.map(k => byKey.get(k)).filter((r): r is Row => Boolean(r));

  const fetchView = useCallback((): Promise<View> => moduleView(def.id), [def.id]);
  useEffect(() => {
    let live = true;
    fetchView()
      .then(v => { if (live) { setView(v); setError(''); } }, (e: Error) => { if (live) setError(e.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [fetchView, setView]);
  function reload() {
    setLoading(true);
    setError('');
    fetchView().then(setView, (e: Error) => setError(e.message)).finally(() => setLoading(false));
  }

  const patch = (changes: Partial<UiState> | ((s: UiState) => Partial<UiState>)) =>
    setUi(u => ({ ...u, [tab.id]: { ...u[tab.id], ...(typeof changes === 'function' ? changes(u[tab.id]) : changes) } }));
  function chooseTab(id: string) {
    setTabId(id);
    setColFilter(null);
    try { localStorage.setItem(def.storageKey, id); } catch { /* not remembered in private mode */ }
  }
  const openAdd = () => setModal({ kind: 'grid', mode: 'add', frame: def.opens.create, rows: Array.from({ length: def.blankRows }, () => gridRow()) });
  function openEditRows(list: Row[]) {
    if (!list.length) { notify('Tick at least one row first', 'error'); return; }
    setModal({ kind: 'grid', mode: 'edit', frame: def.opens.open, rows: list.map(r => gridRow(editValues(tab, r), r)) });
  }
  const openEdit = (keys: string[]) => openEditRows(keys.map(k => byKey.get(k)).filter((r): r is Row => Boolean(r)));
  function openDelete() {
    if (!selectedRows.length) { notify('Tick at least one row first', 'error'); return; }
    setModal({ kind: 'delete', rows: selectedRows });
  }
  function saved(result: SavedView, kind: Mode | 'delete') {
    setView(result);
    setModal(null);
    const r = result.result;
    setListVersion(v => v + 1);
    if (kind !== 'add') { patch({ selected: [] }); setPicked(p => ({ ...p, [tab.id]: [] })); }
    notify(kind === 'add' ? `${entries(r.created)} added`
      : kind === 'edit' ? `${entries(r.updated)} updated${r.skipped ? ` · ${r.skipped} unchanged` : ''}`
      : `${entries(r.deleted)} deleted`, 'success');
  }
  const shownKeys = shown.map(r => keyOf(tab, r));
  const allShown = shown.length > 0 && shownKeys.every(k => selected.includes(k));
  const toggleAll = (on: boolean) => patch(s => ({ selected: on ? [...new Set([...s.selected, ...shownKeys])] : s.selected.filter(k => !shownKeys.includes(k)) }));
  const toggle = (k: string) => patch(s => ({ selected: s.selected.includes(k) ? s.selected.filter(x => x !== k) : [...s.selected, k] }));
  const sortBy = (field: string) => patch(s => ({ sort: nextSort(s.sort, field) }));
  const reset = () => { patch(freshUi(tab)); notify('Filters cleared'); };
  const filtering = Boolean(state.search) || Object.values(state.filters).some(Boolean) || Object.values(state.columnFilters).some(v => v.length > 0);
  const filterColumn = colFilter ? tab.columns.find(c => c.field === colFilter.field) : undefined;
  const seen = new Map<string, number>();

  // A page takes the table's place; the table stays mounted (its filters and scroll) and comes back on Cancel or Save.
  const onPage = modal?.kind === 'grid' && modal.frame === 'page';
  return (
    <section className="panel ds-app">
      <div className="kit-app-list" hidden={onPage}>
      {/* One table only: its title below says it already, so no tab strip. */}
      <div className="ds-tabs" role="tablist" aria-label={`${def.title} tables`} hidden={def.tabs.length < 2}>
        {def.tabs.map(t => <button key={t.id} role="tab" aria-selected={t.id === tab.id} className={t.id === tab.id ? 'active' : ''} onClick={() => chooseTab(t.id)}>{t.label}{!(t.large && t.list) && <span>{view?.tables[t.id]?.length ?? '–'}</span>}</button>)}
      </div>
      <div className="ds-toolbar">
        <div className="ds-title">
          <h2>{tab.title}</h2>
          {!large && <span className="pill">{records(shown.length)}{shown.length !== rows.length ? ` of ${rows.length}` : ''}</span>}
          {view && <TrafficLightTag tone={onSampleData(def.id) ? 'amber' : 'green'}><Server size={11} />{sourceLabel(def.id, view)}</TrafficLightTag>}
        </div>
        <div className="ds-actions">
          <button className="button small" disabled={!view} onClick={openAdd}><Plus size={15} />Add</button>
          {tab.editable && <button className="button secondary small" disabled={!view} onClick={() => (large ? openEditRows(pickedRows) : openEdit(selected))}><Pencil size={14} />Edit{selectedRows.length ? ` (${selectedRows.length})` : ''}</button>}
          <button className="button secondary small" disabled={!view} onClick={openDelete}><Trash2 size={14} />Delete{selectedRows.length ? ` (${selectedRows.length})` : ''}</button>
          <button className="button secondary small" disabled={large || (!filtering && !selected.length)} onClick={reset}><RotateCcw size={14} />Reset</button>
          <button className="button secondary small" disabled={loading} onClick={reload} aria-label="Refresh"><RefreshCw size={14} className={loading ? 'spin' : ''} /></button>
        </div>
      </div>
      {view?.mode === 'local' && onSampleData(def.id) && <Notice>{SAMPLE_DATA_NOTE}</Notice>}
      {error && <Notice error><AlertCircle size={16} />{error}<button className="text-button" onClick={reload}>Retry</button></Notice>}
      {large && tab.list
        ? <LargeList moduleId={def.id} list={tab.list} lk={lk} noun={tab.noun[1].toLowerCase()} version={listVersion}
            selection={{ rows: pickedRows, onChange: list => setPicked(p => ({ ...p, [tab.id]: list })) }}
            onRowDoubleClick={tab.editable ? r => openEditRows([r]) : undefined} />
        : <>
        <div className="ds-filters">
          {tab.filters.map(f => {
            const value = state.filters[f.id] ?? '';
            const set = (v: string) => patch(s => ({ filters: { ...s.filters, [f.id]: v } }));
            return f.kind === 'date'
              ? <label key={f.id} className="search ds-search ds-date-filter" title={f.all}><CalendarDays size={15} /><span className="td-muted">{f.all}</span>
                  <input type="date" aria-label={f.all} value={value} onChange={e => set(e.target.value)} />
                  {value && <button type="button" aria-label={`Clear ${f.all}`} onClick={() => set('')}>×</button>}</label>
              : <FilterCombo key={f.id} all={f.all} options={f.options(rows, lk)} value={value} onChange={set} />;
          })}
          <label className="search ds-search"><Search size={15} /><input aria-label="Search" placeholder="Search…" value={state.search} onChange={e => patch({ search: e.target.value })} />{state.search && <button aria-label="Clear search" onClick={() => patch({ search: '' })}>×</button>}</label>
        </div>
        <div className="table-wrap ds-table-wrap">
          <DataTable columns={[{ kind: 'flag' }, ...columnsFor(tab.columns, tab.grid)]} className="ds-table">
            <thead><tr>
              <th className="ds-cb"><input type="checkbox" aria-label="Select all" checked={allShown} onChange={e => toggleAll(e.target.checked)} /></th>
              {tab.columns.map(c => {
                const on = (state.columnFilters[c.field]?.length ?? 0) > 0;
                return (
                  <th key={c.field} className={`sortable ${on ? 'filtered' : ''} ${state.sort.col === c.field ? 'sorted' : ''} ${alignClass(alignOf(c.field, tab.grid, c.align))}`} aria-sort={ariaSort(state.sort, c.field)}>
                    <span className="ds-th">
                      <button className="ds-sort" onClick={() => sortBy(c.field)}>{c.label}<SortIcon sort={state.sort} col={c.field} /></button>
                      <button className={`ds-flt ${on ? 'on' : ''}`} aria-label={`Filter ${c.label}`} onClick={e => { const anchor = e.currentTarget; setColFilter(f => (f?.field === c.field ? null : { field: c.field, anchor })); }}><ChevronDown size={13} /></button>
                    </span>
                  </th>
                );
              })}
            </tr></thead>
            <tbody>{shown.map(r => {
              // SAP can return rows sharing a table key; React keys must still be unique or stale rows linger.
              const k = keyOf(tab, r);
              const n = (seen.get(k) ?? 0) + 1;
              seen.set(k, n);
              const on = selected.includes(k);
              return (
                <tr key={`${tab.id}|${k}|${n}`} className={on ? 'checked' : ''} onDoubleClick={() => { if (tab.editable) openEdit([k]); }}>
                  <td className="ds-cb"><input type="checkbox" aria-label={`Select ${k}`} checked={on} onChange={() => toggle(k)} /></td>
                  {tab.columns.map(c => <td key={c.field} className={`${c.code ? 'ds-code' : ''} ${c.bold ? 'ds-bold' : ''} ${c.field.startsWith('_') ? 'ds-stamp' : ''} ${alignClass(alignOf(c.field, tab.grid, c.align))}`}><StatusValue definition={c} row={r}>{c.text(r)}</StatusValue></td>)}
                </tr>
              );
            })}</tbody>
          </DataTable>
          {!shown.length && <div className="empty">{loading ? `Loading ${def.noun}…` : <>
            <Database size={26} />
            <h2>{rows.length ? `No ${tab.noun[1].toLowerCase()} match the current filters` : `No ${tab.noun[1].toLowerCase()} yet`}</h2>
            {!rows.length && view && <button className="button small" onClick={openAdd}><Plus size={15} />Add {tab.noun[1]}</button>}
          </>}</div>}
        </div>
        </>}
      <p className="panel-note">{tab.editable ? 'Double-click a row to edit it. ' : ''}Every change is validated before it is saved{view?.mode === 'odata' ? ' to SAP' : ''}.</p>
      </div>
      {!large && colFilter && filterColumn && <ColumnFilter key={filterColumn.field} anchor={colFilter.anchor} values={columnValues(tab, rows, state, filterColumn)} active={state.columnFilters[filterColumn.field] ?? []} onClose={closeFilter}
        onApply={sel => { patch(s => ({ columnFilters: { ...s.columnFilters, [filterColumn.field]: sel } })); setColFilter(null); }} />}
      {modal?.kind === 'grid' && <GridEditor def={def} tab={tab} mode={modal.mode} frame={modal.frame} initial={modal.rows}
        tableRows={large ? modal.rows.flatMap(g => (g.orig ? [g.orig] : [])) : rows} lk={lk} onClose={() => setModal(null)} onSaved={saved} />}
      {modal?.kind === 'delete' && <DeleteConfirm def={def} tab={tab} rows={modal.rows} onClose={() => setModal(null)} onDeleted={result => saved(result, 'delete')} />}
      <Toast toast={toast} />
    </section>
  );
}
