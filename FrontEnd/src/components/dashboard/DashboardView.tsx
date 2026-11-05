// src/components/dashboard/DashboardView.tsx
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from '@/lib/client/nav';
import { AlertCircle, ArrowRight, ArrowUpRight, Database, RefreshCw, Server } from 'lucide-react';
import { hrefOfModule } from '@/config/catalog';
import { isLinkTarget, targetHref } from '@/lib/drill/target';
import { dashboardLoad, dashboardSection, moduleView, onSampleData, sourceLabel } from '@/lib/client/data';
import { clearDashboardCache } from '@/lib/client/dashboard-cache';
import { usePost } from '@/lib/client/use-post';
import { useUnit } from '@/lib/client/use-unit';
import { axisLabel } from '@/lib/dashboard/charts';
import { CHART_KINDS, defaultRange, RANGES, rangesOf, type DashboardSection, type Range, type SectionData, type SectionResult } from '@/lib/dashboard/types';
import { DRILL_DROPPED, pageWith, safeFrom, selectionParams, urlRunOf, urlSelection } from '@/lib/drill/params';
import { cleanValues, formatField, labelOf, valueFields, type AnyField } from '@/lib/fields';
import type { Row, View } from '@/lib/grid/types';
import { markState } from '@/lib/object/history';
import { checkReportSelection } from '@/lib/report/report';
import type { DrillTarget, Unit } from '@/lib/report/types';
import { formatInUnit, formatPercent, unitNote, unitsOf } from '@/lib/report/units';
import type { ErrorDetail } from '@/lib/errors';
import type { AnyDashboardDef } from '@/modules/types';
import { FieldControl } from '@/components/fields/FieldControl';
import { DrillFromBar } from '@/components/report/DrillFromBar';
import { SelectionPanel } from '@/components/report/SelectionPanel';
import { ReportOverview } from '@/components/report/ReportOverview';
import { TrafficLightTag } from '@/components/ui/Badge';
import { Loading } from '@/components/ui/Loading';
import { Notice } from '@/components/ui/Notice';
import { ValueHelpDialog } from '@/components/ui/ValueHelpDialog';
import { BarChart } from './BarChart';
import { DonutChart } from './DonutChart';
import { KpiTile } from './KpiTile';
import { LineChart } from './LineChart';
import { SummaryTable } from './SummaryTable';
import { BarList } from './BarList';
import { EntityCards } from './EntityCards';
import { FlowChart } from './FlowChart';
import { OverviewControls } from './OverviewControls';
import { ShareBar } from './ShareBar';

function storedSelection(key: string): Row {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {};
  } catch {
    return {};
  }
}

/** One section's content by its data kind; charts of scaled amounts name the unit (ALM's chart subtitle). */
function SectionBody({ section, data, unit, onOpen, overview, expanded, measure }: { section: DashboardSection; data: SectionData; unit: Unit; onOpen: (target: DrillTarget) => void; overview: boolean; expanded: boolean; measure?: string }) {
  const amount = (v: string) => formatInUnit(v, unit);
  const label = section.title ?? '';
  if (data.kind === 'tiles') return <>{data.tiles.map(t => <KpiTile key={t.label} tile={t} unit={unit} onOpen={onOpen} layout={overview ? 'overview' : undefined} />)}</>;
  if (data.kind === 'entities') return <EntityCards entities={data.entities} unit={unit} currency={data.currency} onOpen={onOpen} />;
  if (data.kind === 'items') return <BarList label={label} items={data.items} format={amount} onOpen={onOpen} />;
  if (data.kind === 'shares') return <ShareBar label={label} parts={data.parts} format={amount} />;
  if (data.kind === 'steps') return <FlowChart label={label} root={data.root} steps={data.steps} format={amount} expanded={expanded} onOpen={onOpen} />;
  if (data.kind === 'series') {
    const percent = data.format === 'percent';
    const format = percent ? formatPercent : amount;
    // Ticks are in SAP's amounts; each label is the tick in the unit with the decimals the step needs (0.02 crore).
    const axis = (t: number, ticks: number[]) => axisLabel(t, ticks, percent ? 1 : unit.divisor);
    const note = percent ? '' : unitNote(unit);
    return section.kind === 'line'
      ? <LineChart label={label} series={data.series} format={format} axisFormat={axis} note={note} />
      : <BarChart label={label} series={data.series} format={format} axisFormat={axis} note={note} />;
  }
  if (data.kind === 'slices') return <DonutChart label={label} slices={data.slices.map(s => ({ ...s, value: measure ? s.values?.[measure] ?? s.value : s.value }))} format={amount} note={overview ? undefined : unitNote(unit)} total={section.kind === 'donut' ? section.measures?.find(m => m.id === measure)?.label : undefined} />;
  return <SummaryTable data={data} unit={unit} onOpen={onOpen} />;
}

/**
 * One section: its part of the dashboard answer, or its own reload (a range switch or Retry) through /dashboard/range.
 * Each section shows its own loading shimmer and its own error with Retry.
 */
function SectionView({ moduleId, section, base, loading, selection, unit, onOpen, overview = false }: {
  moduleId: string; section: DashboardSection; base: SectionResult | undefined; loading: boolean; selection: Row; unit: Unit; onOpen: (target: DrillTarget) => void; overview?: boolean;
}) {
  const [req, setReq] = useState<{ range: Range | null } | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [measure, setMeasure] = useState(section.kind === 'donut' ? section.measures?.[0]?.id : undefined);
  const own = usePost(dashboardSection, req ? moduleId : null, req ? { selection, section: section.id, range: req.range } : null);
  // While a range loads, the chart of the previous range stays (with a spinner in the header).
  const result: SectionResult | undefined = req ? (own.data ?? (own.error ? { error: own.error.message } : own.last ?? base)) : base;
  const busy = req ? own.loading : loading;
  const range = req?.range ?? defaultRange(section);
  const ranges = rangesOf(section);
  const title = section.title ?? 'Key figures';
  const retry = () => (req ? own.retry() : setReq({ range }));
  const data = result && 'data' in result ? result.data : null;
  const body = result && 'error' in result
    ? <Notice error action={{ label: 'Retry', onClick: retry }}><AlertCircle size={16} />{result.error}</Notice>
    : data ? <SectionBody section={section} data={data} unit={unit} onOpen={onOpen} overview={overview} expanded={expanded} measure={measure} />
    : busy ? <Loading shimmer text={`Loading ${title}`} /> : null;
  if (section.kind === 'tiles' && data) return <section className={overview ? 'kit-ov-kpis kit-ov-wide' : 'ov-tiles'} aria-label={title}>{body}</section>;
  if (section.kind === 'entities' && data) return <div className="kit-ov-wide">{body}</div>;
  const sub = [section.sub, data && 'currency' in data ? data.currency : '', overview ? unitNote(unit) : ''].filter(Boolean).join(' · ');
  return (
    <section className={overview ? `kit-card kit-ov-section ${CHART_KINDS.includes(section.kind) ? '' : 'kit-ov-wide'}` : 'panel ov-section'} aria-label={title} aria-busy={busy}>
      {section.kind !== 'tiles' && <div className={overview ? 'kit-card-head' : 'ov-comp-head'}><div><h2>{title}</h2>{sub && <p>{sub}</p>}</div>
        {section.kind === 'flow' && <div className="kit-row"><button type="button" className="button secondary" disabled={expanded} onClick={() => setExpanded(true)}>Expand all</button><button type="button" className="button secondary" disabled={!expanded} onClick={() => setExpanded(false)}>Collapse all</button></div>}
        {section.kind === 'donut' && section.measures && <div className="kit-seg" role="group" aria-label={`Measure of ${title}`}>{section.measures.map(m => <button key={m.id} type="button" aria-pressed={m.id === measure} onClick={() => setMeasure(m.id)}>{m.label}</button>)}</div>}
        {data?.kind === 'table' && isLinkTarget(data.explore) && <button type="button" className="text-button" onClick={() => onOpen(data.explore!)}>{data.explore.label}<ArrowUpRight size={14} /></button>}
        {ranges.length > 0 && <div className="ov-trange" role="group" aria-label={`Periods of ${title}`}>
          {RANGES.filter(r => ranges.includes(r.id)).map(r => <button key={r.id} type="button" className={r.id === range ? 'on' : ''} aria-pressed={r.id === range} onClick={() => setReq({ range: r.id })}>{r.label}</button>)}
          {busy && <RefreshCw size={14} className="spin" aria-label="Loading" />}
        </div>}
      </div>}
      {body}
    </section>
  );
}

/**
 * A dashboard (spec §6.3): the period bar and Show (the selection goes into the URL as s.*; a drill's f.* fills it), then
 * tiles, charts and tables, each loading and failing on its own. Tiles and table lines click through to other screens.
 */
export default function DashboardView({ def, system = 'SAP' }: { def: AnyDashboardDef; system?: string }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [view, setView] = useState<View | null>(null);
  const [viewError, setViewError] = useState('');
  const [saved] = useState(() => storedSelection(def.storageKey));
  const [edit, setEdit] = useState<{ key: string; row: Row } | null>(null);
  const [local, setLocal] = useState<ErrorDetail[]>([]);
  const [help, setHelp] = useState<AnyField | null>(null);
  const units = unitsOf(def.units);
  // The unit starts from the URL (u, carried back from a drill) or the first unit.
  const { unit, dropped: unitDropped, choose: setUnitId } = useUnit(units, params.get('u'), () => def.defaultUnit ?? units[0].id);
  const lk = useMemo(() => def.lookups(view?.lookups), [def, view]);

  useEffect(() => {
    let live = true;
    moduleView(def.id).then(v => { if (live) setView(v); }, (e: Error) => { if (live) setViewError(e.message); });
    return () => { live = false; };
  }, [def.id]);

  const parsed = useMemo(() => (view ? urlSelection(params, def.selection, lk) : null), [view, params, def.selection, lk]);
  const selKey = [...params].filter(([k]) => k === 's' || k.startsWith('s.') || k.startsWith('f.')).map(([k, v]) => `${k}=${v}`).join('&');
  // The URL asks for a run: until the view (and its lookups) is in, the form waits disabled instead of showing other values.
  const urlRun = selKey !== '';
  const pending = urlRun && !view && !viewError;
  // A URL that asks for a run shows exactly its values and runs only when nothing was dropped and the selection is
  // complete (else the form waits under the notice); the values remembered from the last run fill only an empty URL.
  const complete = parsed?.given === true && !parsed.dropped.length && !checkReportSelection(def, parsed.values, lk).problems.length;
  const initial = useMemo(() => ({ ...def.defaults?.(lk), ...saved }), [def, lk, saved]);
  const automatic = def.autoRun || !def.selection.length;
  const request = parsed && complete ? parsed.values : !urlRun && view && automatic && !checkReportSelection(def, initial, lk).problems.length ? initial : null;
  const res = usePost(dashboardLoad, request ? def.id : null, request ? { selection: request } : null);
  const form: Row = edit && edit.key === selKey ? edit.row : urlRun ? parsed?.values ?? {} : initial;
  // Show on the same URL runs again: every section starts over from the new answer (its own range is reset).
  const [runs, setRuns] = useState(0);

  useEffect(() => {
    if (!res.data || !request) return;
    try { localStorage.setItem(def.storageKey, JSON.stringify(request)); } catch { /* not remembered in private mode */ }
  }, [res.data, request, def.storageKey]);

  function submit(next: Row = form) {
    const selection = cleanValues(def.selection, next);
    const problems = checkReportSelection(def, selection, lk).problems;
    setLocal(problems);
    if (problems.length) return;
    clearDashboardCache();
    const p = selectionParams(selection);
    if (![...p.keys()].length) p.set('s', '');
    if (def.overview) p.set('u', unit.id);
    const back = safeFrom(params.get('from'));
    if (back) p.set('from', back);
    const search = `?${p}`;
    // Show always reads again: the same URL, or a URL that differs outside the selection (u, from) with the same selection.
    const same = request !== null && JSON.stringify(urlRunOf(selection)) === JSON.stringify(request);
    if (search === window.location.search) { setRuns(n => n + 1); res.retry(); return; }
    setEdit(null);
    window.history.replaceState(markState(window.history.state), '', `${pathname}${search}`);
    if (same) { setRuns(n => n + 1); res.retry(); }
  }
  const open = (target: DrillTarget) => {
    if (!request) return;
    // The unit travels with the drill (u) and on the way back (from), so both pages show the same unit.
    const href = targetHref(target, pageWith(pathname, request, { u: unit.id }), { u: unit.id });
    if (href) router.push(href);
  };
  const sectionView = (s: DashboardSection) => (
    <SectionView key={`${selKey}|${runs}|${s.id}`} moduleId={def.id} section={s} base={res.data?.sections[s.id]} loading={res.loading} selection={request ?? {}} unit={unit} onOpen={open} overview={Boolean(def.overview)} />
  );
  const fieldError = (d: AnyField) => local.find(p => p.field === d.field || (d.yearField !== undefined && p.field === d.yearField))?.message;
  const charts = def.sections.filter(s => CHART_KINDS.includes(s.kind));
  const selectionText = request ? valueFields(def.selection).map(d => formatField(d, request, lk)).filter(Boolean).join(' · ') : def.selection.map(d => labelOf(d)).join(' · ');
  const sectionErrors = res.data ? Object.values(res.data.sections).some(s => 'error' in s) : false;

  return (
    <div className={def.overview ? 'ov kit-overview' : 'ov'}>
      {def.overview ? <OverviewControls def={def} selection={request} lk={lk} units={units} unit={unit} system={system} fullReport={def.overview.fullReport ? hrefOfModule(def.overview.fullReport) : null} busy={res.loading}
        source={view && <TrafficLightTag tone={onSampleData(def.id) ? 'amber' : 'green'}>{sourceLabel(def.id, view)}</TrafficLightTag>}
        onUnit={setUnitId} onSelect={submit} onRefresh={() => submit(request ?? form)} /> : <>
      <SelectionPanel summary={selectionText}>
        <form className="ov-period" onSubmit={e => { e.preventDefault(); submit(); }}>
          {def.selection.map(d => (
            <FieldControl key={d.field} def={d} variant="form" row={form} lk={lk} error={fieldError(d)} disabled={pending}
              onChange={(f, v) => setEdit({ key: selKey, row: { ...form, [f]: v } })} onValueHelp={d.valueHelp && d.lookup ? () => setHelp(d) : undefined} />
          ))}
          {units.length > 1 && <label className="field"><span>Amounts in</span>
            <select value={unit.id} onChange={e => setUnitId(e.target.value)}>{units.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}</select></label>}
          <button className="button" type="submit" disabled={!view || res.loading}>{res.loading ? <RefreshCw size={15} className="spin" /> : <ArrowRight size={15} />}Show</button>
        </form>
      </SelectionPanel>
      <ReportOverview title={def.title} selection={selectionText} loading={res.loading} ready={Boolean(res.data)} error={Boolean(res.error || viewError || local.length || sectionErrors)}
        output={def.sections.map(s => s.title ?? 'Key figures').join(' · ')} />
      <div className="ov-chips kit-dashboard-status">
        {view && <TrafficLightTag tone={onSampleData(def.id) ? 'amber' : 'green'}><Server size={11} />{sourceLabel(def.id, view)}</TrafficLightTag>}
        {res.data?.chips?.map(c => <TrafficLightTag key={c.label} tone={c.tone === 'saved' ? 'green' : c.tone === 'locked' ? 'red' : 'amber'}>{c.label}</TrafficLightTag>)}
      </div>
      </>}
      <DrillFromBar from={params.get('from')} />
      {viewError && <Notice error><AlertCircle size={16} />{viewError}</Notice>}
      {((parsed && parsed.dropped.length > 0) || unitDropped) && <Notice kind="warn">{DRILL_DROPPED}</Notice>}
      {local.length > 0 && <Notice error><AlertCircle size={16} /><span>{local.map(p => p.message).join(' ')}</span></Notice>}
      {res.error && <Notice error action={res.error.status === 400 ? undefined : { label: 'Retry', onClick: res.retry }}><AlertCircle size={16} /><span>{res.error.message}</span></Notice>}
      {pending && <section className="panel"><Loading text="Loading…" /></section>}
      {!request && !pending && (!automatic || view) && <section className="panel"><div className="empty"><Database size={26} /><h2>Choose a period</h2><p>Pick {def.selection.map(d => labelOf(d)).join(' and ')} above, then press Show.</p>{automatic && <button className="button" onClick={() => submit(def.defaults?.(lk) ?? {})}>Use default selection</button>}</div></section>}
      {request && !res.error && (def.overview ? <div className="kit-ov-grid">{def.sections.map(sectionView)}</div> : <>
        {def.sections.filter(s => s.kind === 'entities' || s.kind === 'flow').map(sectionView)}
        {def.sections.filter(s => s.kind === 'tiles').map(sectionView)}
        {charts.length > 0 && <div className="kit-dash-grid">{charts.map(sectionView)}</div>}
        {def.sections.filter(s => s.kind === 'table').map(sectionView)}
      </>)}
      {help?.lookup && <ValueHelpDialog title={`Select ${labelOf(help)}`} items={help.lookup(lk, form)} onClose={() => setHelp(null)}
        onPick={code => { setEdit({ key: selKey, row: { ...form, [help.field]: code } }); setHelp(null); }} />}
    </div>
  );
}
