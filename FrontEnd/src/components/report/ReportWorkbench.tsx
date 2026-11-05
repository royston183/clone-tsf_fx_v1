// src/components/report/ReportWorkbench.tsx
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from '@/lib/client/nav';
import { AlertCircle, ArrowLeft, ArrowRight, Database, Download, RefreshCw, Search, Server } from 'lucide-react';
import { hrefOfModule } from '@/config/catalog';
import { isClickable, targetHref } from '@/lib/drill/target';
import { moduleView, onSampleData, reportRun, SAMPLE_DATA_NOTE, sourceLabel } from '@/lib/client/data';
import { exportReport } from '@/lib/client/report-export';
import { useAlvLayout } from '@/lib/client/use-layouts';
import { usePost } from '@/lib/client/use-post';
import { useUnit } from '@/lib/client/use-unit';
import { DRILL_DROPPED, drillStack, openHref, pageWith, safeFrom, selectionParams, urlRunOf, urlSelection, type DrillLevel } from '@/lib/drill/params';
import { cleanValues, formatField, labelOf, valueFields, type AnyField } from '@/lib/fields';
import type { Row, View } from '@/lib/grid/types';
import { alvModel, reportLayoutTarget, toggleKey } from '@/lib/layout/layout';
import { markState } from '@/lib/object/history';
import { openParam } from '@/lib/object/object';
import { formattedLines, gridLines, idColumn } from '@/lib/report/export';
import { checkReportSelection, rowStyleOf, searchRows, visibleFormatted } from '@/lib/report/report';
import type { DrillTarget, FormattedReport, LineItemReport, ReportResult, Unit } from '@/lib/report/types';
import { isZero, unitsOf } from '@/lib/report/units';
import type { ErrorDetail } from '@/lib/errors';
import { MODULES } from '@/modules/registry';
import type { AnyReportDef } from '@/modules/types';
import { FieldControl } from '@/components/fields/FieldControl';
import { useWorkspace } from '@/components/shell/WorkspaceProvider';
import { Loading } from '@/components/ui/Loading';
import { Notice } from '@/components/ui/Notice';
import { ValueHelpDialog } from '@/components/ui/ValueHelpDialog';
import { TrafficLightTag } from '@/components/ui/Badge';
import { AlvGrid } from './AlvGrid';
import { BreakdownBody, BreakdownDialog } from './BreakdownDialog';
import { DrillFromBar } from './DrillFromBar';
import { LayoutControls } from './LayoutControls';
import { ReportGrid } from './ReportGrid';
import { SelectionPanel } from './SelectionPanel';
import { ReportOverview } from './ReportOverview';

function stored<T>(key: string, fallback: T, read: (raw: string) => T | null): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : read(raw) ?? fallback;
  } catch {
    return fallback;
  }
}
const asRow = (raw: string): Row | null => {
  const v: unknown = JSON.parse(raw);
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : null;
};
/** How many breakdown levels this page pushed onto the history: Close goes back over exactly those. */
const pushedLevels = (): number => {
  const s = window.history.state as { drillPushed?: unknown } | null;
  return typeof s?.drillPushed === 'number' ? s.drillPushed : 0;
};
type Export = (format: 'xlsx' | 'csv') => void;

function UnitSelect({ unit, units, onUnit }: { unit: Unit; units: Unit[]; onUnit: (id: string) => void }) {
  return (
    <label className="field trm-unit"><span>Amounts in</span>
      <select value={unit.id} onChange={e => onUnit(e.target.value)}>{units.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}</select>
    </label>
  );
}
function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="search ds-search"><Search size={15} />
      <input aria-label="Search rows" placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} />
      {value && <button type="button" aria-label="Clear search" onClick={() => onChange('')}>×</button>}
    </label>
  );
}
function ExportButtons({ onExport }: { onExport: Export }) {
  return <>
    <button type="button" className="button secondary small" onClick={() => onExport('xlsx')}><Download size={14} />Export Excel</button>
    <button type="button" className="button secondary small" onClick={() => onExport('csv')}><Download size={14} />Export CSV</button>
  </>;
}

interface BodyProps { def: AnyReportDef; data: ReportResult | null; unit: Unit; units: Unit[]; onUnit: (id: string) => void }

/** A formatted report: display options, the styled rows with drill cells, and the breakdown pop-up of ?drill=. */
function FormattedBody({ def, report, data, unit, units, onUnit, stack, highlight, onLevel, onBack, onClose, onTarget }: BodyProps & {
  report: FormattedReport; stack: DrillLevel[]; highlight: string | null;
  onLevel: (level: DrillLevel) => void; onBack: () => void; onClose: () => void; onTarget: (target: DrillTarget, rowId: string) => void;
}) {
  const [showZero, setShowZero] = useState(false);
  const [hideFlagged, setHideFlagged] = useState(false);
  const [search, setSearch] = useState('');
  const rows = useMemo(() => (data ? visibleFormatted(report, data.rows, { showZero, hideFlagged, search }) : []), [report, data, showZero, hideFlagged, search]);
  if (!data?.rows.length) return null;
  const selection = data.meta.selection;
  const drillOf = (row: Row, column: string | null) => def.drill?.(row, column, selection) ?? { kind: 'none' as const };
  const amounts = report.columns.filter(c => c.type === 'amount').map(c => c.id);
  // Only a non-zero amount drills; percent rows never do (their values are ratios, not sums), nor rows the module maps to none.
  const drillable = (row: Row, column: string | null) => rowStyleOf(report, row) !== 'percent'
    && (column === null ? amounts.some(a => !isZero(row[a])) : !isZero(row[column])) && isClickable(drillOf(row, column));
  const drill = (row: Row, column: string | null) => {
    const target = drillOf(row, column);
    const id = row[report.idField] ?? '';
    if (target.kind === 'breakdown') onLevel({ row: id, column });
    else if (isClickable(target)) onTarget(target, id);
  };
  const exportAs: Export = format => exportReport(format, def.id, {
    title: def.title, selectionText: data.meta.selectionText, readAt: data.meta.readAt, unit, columns: [idColumn(report), ...report.columns], lines: formattedLines(report, rows, unit)
  });
  const breakdown = { moduleId: def.id, report, selection, rows: data.rows, stack, unit, canDrill: drillable, onDrill: drill, onBack };
  // A report that opens its breakdown as a page shows it in place of the report; Back to report clears ?drill=.
  if (def.breakdownOpens === 'page' && stack.length > 0) {
    return <>
      <div className="kit-breakdown-nav"><button type="button" className="button secondary small" onClick={onClose}><ArrowLeft size={14} />Back to report</button></div>
      <BreakdownBody {...breakdown} />
    </>;
  }
  return (
    <>
      <div className="ds-filters md-filters trm-filters">
        <UnitSelect unit={unit} units={units} onUnit={onUnit} />
        <label className="md-toggle"><input type="checkbox" checked={showZero} onChange={e => setShowZero(e.target.checked)} />Display zero values</label>
        {report.hideFlag && <label className="md-toggle"><input type="checkbox" checked={hideFlagged} onChange={e => setHideFlagged(e.target.checked)} />{report.hideFlag.label}</label>}
        <div className="md-period-right">
          <span className="md-context">{data.meta.selectionText}</span>
          <SearchBox value={search} onChange={setSearch} placeholder="Search ID or name…" />
          <ExportButtons onExport={exportAs} />
        </div>
      </div>
      {rows.length
        ? <ReportGrid nativeExport title={def.title} report={report} rows={rows} unit={unit} drillable={drillable} onDrill={drill} highlight={highlight} />
        : <div className="empty"><Search size={24} /><h2>No rows match the current filters</h2><p>Tick “Display zero values” to see the rows without amounts.</p></div>}
      {stack.length > 0 && <BreakdownDialog {...breakdown} onClose={onClose} />}
    </>
  );
}

/** Line items: the ALV grid built from the layout (picker and dialogs when the report has layouts), search and export. */
function LineItemsBody({ def, report, data, unit, units, onUnit, canShare, onOpen }: BodyProps & { report: LineItemReport; canShare: boolean; onOpen?: (row: Row) => void }) {
  const target = useMemo(() => reportLayoutTarget(report.columns, report.standard, report.layouts ?? {}, units.map(u => u.id)), [report, units]);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState('');
  const alv = useAlvLayout(def.id, target, Boolean(report.layouts), layout => { setCollapsed(new Set()); if (layout.unit) onUnit(layout.unit); });
  const rows = useMemo(() => (data ? searchRows(data.rows, report.columns, search) : []), [data, report.columns, search]);
  const model = useMemo(() => alvModel(report.columns, alv.layout, rows, collapsed), [report.columns, alv.layout, rows, collapsed]);
  const sort = (col: string) => {
    const first = alv.layout.sort[0];
    alv.change({ ...alv.layout, sort: [{ col, desc: first?.col === col ? !first.desc : false }] });
  };
  return (
    <>
      {alv.error && <Notice error><AlertCircle size={16} />{alv.error}</Notice>}
      {data && data.rows.length > 0 && <>
        <div className="ds-filters md-filters trm-filters">
          <UnitSelect unit={unit} units={units} onUnit={onUnit} />
          <div className="md-period-right">
            <span className="md-context">{data.meta.selectionText}</span>
            <SearchBox value={search} onChange={setSearch} placeholder="Search codes and names…" />
            <ExportButtons onExport={format => exportReport(format, def.id, {
              title: def.title, selectionText: data.meta.selectionText, readAt: data.meta.readAt, unit, columns: model.visible, lines: gridLines(model.grid, model.totals, model.visible, unit)
            })} />
          </div>
          {report.layouts && <LayoutControls alv={alv} target={target} units={units} canShare={canShare} />}
        </div>
        {rows.length
          ? <AlvGrid nativeExport nativeLayout={Boolean(report.layouts)} title={def.title} model={model} layout={alv.layout} unit={unit} onSort={sort} onToggle={key => setCollapsed(c => toggleKey(c, key))} onOpen={onOpen} />
          : <div className="empty"><Search size={24} /><h2>No lines match the search</h2></div>}
      </>}
    </>
  );
}

/**
 * A report (spec §3.3): selection bar and Run, then the formatted report or the ALV list. The URL holds the run (s.*, or
 * f.* of a drill), the breakdown stack (drill) and the row to outline (hl): Run replaces s.*, each breakdown level is a
 * history entry (Back closes it), and a drill to another screen carries `from` back here.
 */
export default function ReportWorkbench({ def }: { def: AnyReportDef }) {
  const { workspace } = useWorkspace();
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [view, setView] = useState<View | null>(null);
  const [viewError, setViewError] = useState('');
  const [saved] = useState(() => stored<Row>(def.storageKey, {}, asRow));
  const [edit, setEdit] = useState<{ key: string; row: Row } | null>(null);
  const [local, setLocal] = useState<ErrorDetail[]>([]);
  const [help, setHelp] = useState<AnyField | null>(null);
  const units = unitsOf(def.units);
  // The unit starts from the URL (u, carried from a dashboard or back from a drill), else the one remembered.
  const { unit, dropped: unitDropped, choose: setUnitId } = useUnit(units, params.get('u'), () => stored<string>(`${def.storageKey}-unit`, '', raw => raw));
  const lk = useMemo(() => def.lookups(view?.lookups), [def, view]);
  const me = workspace.session?.actingUser ?? '';
  const editors = def.report.variant === 'lineItems' ? def.report.layouts?.sharedEditors : undefined;
  const canShare = !editors || editors.some(e => e.toUpperCase() === me);

  useEffect(() => {
    let live = true;
    moduleView(def.id).then(v => { if (live) setView(v); }, (e: Error) => { if (live) setViewError(e.message); });
    return () => { live = false; };
  }, [def.id]);
  useEffect(() => {
    try { localStorage.setItem(`${def.storageKey}-unit`, unit.id); } catch { /* not remembered in private mode */ }
  }, [def.storageKey, unit.id]);

  // The run is the selection in the URL (s.*, or f.* of a drill), checked like typed input once the lookups are in.
  const parsed = useMemo(() => (view ? urlSelection(params, def.selection, lk) : null), [view, params, def.selection, lk]);
  const selKey = [...params].filter(([k]) => k === 's' || k.startsWith('s.') || k.startsWith('f.')).map(([k, v]) => `${k}=${v}`).join('&');
  // The URL asks for a run: until the view (and its lookups) is in, the form waits disabled instead of showing other values.
  const urlRun = selKey !== '';
  const pending = urlRun && !view && !viewError;
  // As on dashboards and items: a URL run runs by itself only when nothing was dropped and the selection passes its checks;
  // otherwise the form shows the URL's values under the notice and waits for Run.
  const complete = parsed?.given === true && !parsed.dropped.length && !checkReportSelection(def, parsed.values, lk).problems.length;
  // An empty URL opens with the defaults under the last run's values; with autoRun they run at once when they pass the checks.
  const initial = useMemo(() => ({ ...def.defaults?.(lk), ...saved }), [def, lk, saved]);
  const request = parsed && complete ? parsed.values : !urlRun && view && def.autoRun && !checkReportSelection(def, initial, lk).problems.length ? initial : null;
  const run = usePost(reportRun, request ? def.id : null, request ? { selection: request } : null);
  const data = run.data;
  // A URL that asks for a run shows exactly that run; the defaults and the last run's values fill only an empty URL.
  const form: Row = edit && edit.key === selKey ? edit.row : urlRun ? parsed?.values ?? {} : initial;
  const highlight = params.get('hl');
  const stack = drillStack(params.get('drill'));

  useEffect(() => {
    if (!data) return;
    try { localStorage.setItem(def.storageKey, JSON.stringify(data.meta.selection)); } catch { /* not remembered in private mode */ }
  }, [data, def.storageKey]);
  // Back to report: scroll to the drilled row (outlined by ReportGrid).
  useEffect(() => {
    if (!highlight || !data) return;
    document.querySelector(`tr[data-row="${CSS.escape(highlight)}"]`)?.scrollIntoView({ block: 'center' });
  }, [highlight, data]);

  /** Run: check in the browser, then put the selection into the URL (the run follows the URL); the same run reads again. */
  function submit(next: Row = form) {
    const selection = cleanValues(def.selection, next);
    const problems = checkReportSelection(def, selection, lk).problems;
    setLocal(problems);
    if (problems.length) return;
    const p = selectionParams(selection);
    if (![...p.keys()].length) p.set('s', '');
    const back = safeFrom(params.get('from'));
    if (back) p.set('from', back);
    const search = `?${p}`;
    // The same request again (the URL differs only outside the selection: hl, u, or f.* turning into s.*) must read again too.
    const same = request !== null && JSON.stringify(urlRunOf(selection)) === JSON.stringify(request);
    if (search === window.location.search) { run.retry(); return; }
    setEdit(null);
    window.history.replaceState(markState(window.history.state), '', `${pathname}${search}`);
    if (same) run.retry();
  }
  /** This page as a drill target's `from`: the run, the unit and this page's own from (so a second drill still leads home). */
  const backHere = (selection: Row, extra: Record<string, string> = {}) => {
    const back = safeFrom(params.get('from'));
    return pageWith(pathname, selection, { ...extra, u: unit.id, ...(back ? { from: back } : {}) });
  };

  const withStack = (next: DrillLevel[]) => {
    const p = new URLSearchParams(window.location.search);
    if (next.length) p.set('drill', JSON.stringify(next)); else p.delete('drill');
    p.delete('hl');
    return `${pathname}?${p}`;
  };
  const openLevel = (level: DrillLevel) =>
    window.history.pushState({ ...markState(window.history.state, 'objOpen'), drillPushed: pushedLevels() + 1 }, '', withStack([...stack, level]));
  const backLevel = () => {
    if (pushedLevels() > 0) window.history.back();
    else window.history.replaceState(markState(window.history.state), '', withStack(stack.slice(0, -1)));
  };
  const closeLevels = () => {
    const n = pushedLevels();
    if (n > 0 && n >= stack.length) window.history.go(-stack.length);
    else window.history.replaceState(markState(window.history.state), '', withStack([]));
  };
  const goTarget = (target: DrillTarget, rowId: string) => {
    const href = data ? targetHref(target, backHere(data.meta.selection, { hl: rowId })) : null;
    if (href) router.push(href);
  };
  const openLine = (row: Row) => {
    const report = def.report;
    if (report.variant !== 'lineItems' || !report.open || !data) return;
    const target = Object.hasOwn(MODULES, report.open) ? MODULES[report.open] : undefined;
    const path = hrefOfModule(report.open);
    if (target?.kind === 'object' && path) router.push(openHref(path, openParam(target.list.keys, row), backHere(data.meta.selection)));
  };

  const report = def.report;
  const error = run.error;
  const selectionSummary = valueFields(def.selection).map(d => formatField(d, form, lk)).filter(Boolean).join(' · ') || def.selection.map(d => labelOf(d)).join(' · ');
  const fieldError = (d: AnyField) => local.find(p => p.field === d.field || (d.yearField !== undefined && p.field === d.yearField))?.message;
  return (
    <div className="kit-report-page">
      <SelectionPanel summary={selectionSummary}>
        <form className="md-period" onSubmit={e => { e.preventDefault(); submit(); }}>
          {def.selection.map(d => (
            <FieldControl key={d.field} def={d} variant="form" row={form} lk={lk} error={fieldError(d)} disabled={pending}
              onChange={(f, v) => setEdit({ key: selKey, row: { ...form, [f]: v } })} onValueHelp={d.valueHelp && d.lookup ? () => setHelp(d) : undefined} />
          ))}
          <button className="button" type="submit" disabled={!view || run.loading}>{run.loading ? <RefreshCw size={15} className="spin" /> : <ArrowRight size={15} />}Run</button>
        </form>
      </SelectionPanel>
      <ReportOverview title={def.title} selection={data?.meta.selectionText ?? def.selection.map(d => labelOf(d)).join(' · ')}
        loading={run.loading} ready={Boolean(data)} error={Boolean(error || viewError || local.length)}
        output={data ? `${data.rows.length} rows · ${unit.label}${def.drill || (report.variant === 'lineItems' && report.open) ? ' · Open details from a row' : ''}` : report.variant === 'formatted' ? 'Formatted statement with totals and breakdowns' : 'Line items with search, layouts and export'} />
    <section className="panel ds-app md-app trm-app qr-app">
      <div className="ds-toolbar">
        <div className="ds-title">
          <h2>{def.title}</h2>
          {data && <span className="pill">{data.rows.length} {data.rows.length === 1 ? 'row' : 'rows'}</span>}
          {view && <TrafficLightTag tone={onSampleData(def.id) ? 'amber' : 'green'}><Server size={11} />{sourceLabel(def.id, view)}</TrafficLightTag>}
        </div>
      </div>
      <DrillFromBar from={params.get('from')} />
      {view?.mode === 'local' && onSampleData(def.id) && <Notice>{SAMPLE_DATA_NOTE}</Notice>}
      {viewError && <Notice error><AlertCircle size={16} />{viewError}</Notice>}
      {((parsed && parsed.dropped.length > 0) || unitDropped) && <Notice kind="warn">{DRILL_DROPPED}</Notice>}
      {local.length > 0 && <Notice error><AlertCircle size={16} /><span>{local.map(p => p.message).join(' ')}</span></Notice>}
      {error && (error.status === 422
        ? <Notice kind="warn">{error.message}</Notice>
        : <Notice error action={error.status === 400 ? undefined : { label: 'Retry', onClick: run.retry }}><AlertCircle size={16} /><span>{error.message}</span></Notice>)}
      {pending && <Loading text="Loading…" />}
      {!request && !pending && (!def.autoRun || view) && <div className="empty"><Database size={26} /><h2>Choose a selection</h2><p>Pick {def.selection.map(d => labelOf(d)).join(' and ')} above, then press Run.</p>
        {def.defaults && <button type="button" className="button" onClick={() => submit(def.defaults?.(lk) ?? {})}>Use default selection</button>}</div>}
      {run.loading && <Loading text="Running the report…" />}
      {data && !data.rows.length && <div className="empty"><Database size={26} /><h2>No rows for this selection</h2></div>}
      {report.variant === 'formatted'
        ? <FormattedBody def={def} report={report} data={data} unit={unit} units={units} onUnit={setUnitId} stack={stack} highlight={highlight}
            onLevel={openLevel} onBack={backLevel} onClose={closeLevels} onTarget={goTarget} />
        : <LineItemsBody def={def} report={report} data={data} unit={unit} units={units} onUnit={setUnitId} canShare={canShare} onOpen={report.open ? openLine : undefined} />}
      {help?.lookup && <ValueHelpDialog title={`Select ${labelOf(help)}`} items={help.lookup(lk, form)} onClose={() => setHelp(null)}
        onPick={code => { setEdit({ key: selKey, row: { ...form, [help.field]: code } }); setHelp(null); }} />}
      <p className="panel-note">{report.variant === 'formatted'
        ? `Click an underlined ID or amount to drill down: a heading shows the rows that make it up, a row with source data opens its screen. Amounts in ${unit.label}; percent rows are not scaled.`
        : `Change Layout picks, sorts and subtotals the columns; save it for everyone or only for you.${report.open ? ' Click a line to open it.' : ''} Amounts in ${unit.label}; currencies are never added together.`}</p>
    </section>
    </div>
  );
}
