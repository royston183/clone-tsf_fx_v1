// src/components/items/ItemsWorkbench.tsx
import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { useSearchParams } from '@/lib/client/nav';
import { AlertCircle, ArrowRight, Database, RefreshCw, RotateCcw, Save, Server } from 'lucide-react';
import { itemsRead, itemsSave, moduleView, onSampleData, SAMPLE_DATA_NOTE, sourceLabel } from '@/lib/client/data';
import type { ErrorDetail, HttpError } from '@/lib/errors';
import { DRILL_DROPPED, parseDrillParams, type ParsedParams } from '@/lib/drill/params';
import { behaviourOf, formatField, labelOf, valueFields, type AnyField } from '@/lib/fields';
import { formatAmount } from '@/lib/fields/parse';
import { gridRowsOf, problemsByGrid, rowsOfGrid } from '@/lib/grid/edit-rows';
import { cellValue } from '@/lib/grid/grid';
import type { GridRow, Row, View } from '@/lib/grid/types';
import { changeSummary, checkItems, planItems, seenOf } from '@/lib/items/items';
import { totalsByCurrency } from '@/lib/items/totals';
import type { AnyItemsDef } from '@/modules/types';
import { FieldControl } from '@/components/fields/FieldControl';
import { EditGrid, type FooterRow } from '@/components/grid/EditGrid';
import { DrillFromBar } from '@/components/report/DrillFromBar';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { modalStack } from '@/components/ui/Modal';
import { Notice } from '@/components/ui/Notice';
import { TrafficLightTag } from '@/components/ui/Badge';
import { ReviewDialog } from '@/components/ui/ReviewDialog';
import { Toast, useToast } from '@/components/ui/Toast';
import { ValueHelpDialog } from '@/components/ui/ValueHelpDialog';
import { gridRow } from '@/components/workbench/GridEditor';

interface Shown { selection: Row; stored: Row[] }

function storedSelection(def: AnyItemsDef): Row {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(def.storageKey) ?? 'null');
    return v && typeof v === 'object' ? v as Row : {};
  } catch {
    return {};
  }
}

/** Header + items (spec §5.2): ALM's period bar, then an editable amount grid with totals per currency. */
export default function ItemsWorkbench({ def }: { def: AnyItemsDef }) {
  const params = useSearchParams();
  // A drill from another screen (spec §5.2): f.<field> is the selection, checked against the real lookups once the
  // view is in, and shown at once when complete. Invalid values are dropped with a notice and nothing is shown.
  const [drill, setDrill] = useState<ParsedParams | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState('');
  const [selection, setSelection] = useState<Row>(() => storedSelection(def));
  const [shown, setShown] = useState<Shown | null>(null);
  const [grid, setGrid] = useState<GridRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [server, setServer] = useState<{ message: string; details: ErrorDetail[] } | null>(null);
  const [step, setStep] = useState<null | 'review' | 'discard'>(null);
  const [help, setHelp] = useState<AnyField | null>(null);
  const [toast, notify] = useToast();
  const lk = useMemo(() => def.lookups(view?.lookups), [def, view]);

  const applyDrill = useEffectEvent((v: View) => {
    if (![...params.keys()].some(k => k.startsWith('f.'))) return;
    const d = parseDrillParams(params, 'f', def.selection, def.lookups(v.lookups));
    setDrill(d);
    // A drill runs exactly its own selection (no remembered values fill a gap); it is shown only when it is complete.
    setSelection(d.values);
    if (!d.dropped.length && valueFields(def.selection).every(f => !f.required || d.values[f.field])) show(false, d.values);
  });
  useEffect(() => {
    let live = true;
    moduleView(def.id).then(v => { if (live) { setView(v); applyDrill(v); } }, (e: Error) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [def.id]);

  const { rows, index } = useMemo(() => rowsOfGrid(def.grid, grid), [def.grid, grid]);
  const plan = useMemo(() => (shown ? planItems(def, shown.stored, rows, shown.selection) : null), [def, shown, rows]);
  const changes = plan?.ops.length ?? 0;
  const local = useMemo(() => (shown ? checkItems(def, rows, shown.selection, lk) : []), [def, rows, shown, lk]);
  const problems = problemsByGrid([...local, ...(server?.details ?? [])], index);
  const general = [...local, ...(server?.details ?? [])].filter(p => !p.row).map(p => p.message);
  const totals = useMemo(() => totalsByCurrency(rows, def.grid, def.totals ?? []), [rows, def]);
  const footer: FooterRow[] = totals.map(t => ({
    label: 'Total',
    values: Object.fromEntries((def.totals ?? []).flatMap((f): [string, string][] => {
      const d = def.grid.find(x => x.field === f);
      const cells: [string, string][] = [[f, formatAmount(t.sums[f] ?? '0.00')]];
      if (d?.currencyField) cells.push([d.currencyField, t.currency || '—']);
      return cells;
    }))
  }));
  const cellClass = (g: GridRow, d: AnyField) => {
    const now = cellValue(d, g.values[d.field]);
    const dirty = g.orig ? now !== cellValue(d, g.orig[d.field]) : Boolean(now);
    return `${behaviourOf(d).align === 'right' ? 'md-cell' : ''} ${dirty ? 'dirty' : ''}`;
  };

  // Unsaved changes: the browser asks before the page is left.
  useEffect(() => {
    if (!changes) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    addEventListener('beforeunload', warn);
    return () => removeEventListener('beforeunload', warn);
  }, [changes]);

  function show(force = false, wanted: Row = selection) {
    if (changes && !force) { setStep('discard'); return; }
    setStep(null);
    setLoading(true);
    setServer(null);
    itemsRead(def.id, wanted).then(out => {
      setShown({ selection: out.selection, stored: out.rows });
      setGrid(gridRowsOf(def.grid, out.rows, gridRow));
      setError('');
      try { localStorage.setItem(def.storageKey, JSON.stringify(out.selection)); } catch { /* not remembered in private mode */ }
    }, (e: Error) => setError(e.message)).finally(() => setLoading(false));
  }
  const save = () => { if (changes && !local.length && !busy) setStep('review'); };
  async function send() {
    if (!shown) return;
    setBusy(true);
    try {
      const out = await itemsSave(def.id, { selection: shown.selection, seen: shown.stored.map(r => seenOf(def, r)), rows });
      setShown({ selection: out.selection, stored: out.rows });
      setGrid(gridRowsOf(def.grid, out.rows, gridRow));
      setStep(null);
      setServer(null);
      notify(`Saved: ${changeSummary(out.result)}`, 'success');
    } catch (e) {
      const err = e as HttpError;
      setStep(null);
      setServer({ message: err.message, details: err.details ?? [] });
    } finally { setBusy(false); }
  }
  // Ctrl+S saves while no dialog is open (re-subscribed each render, so it always sees the current rows).
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && modalStack.size() === 0) { e.preventDefault(); save(); }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  });

  const selectionText = shown ? valueFields(def.selection).map(d => formatField(d, shown.selection, lk)).filter(Boolean).join(' · ') : '';
  return (
    <section className="panel ds-app md-app">
      <div className="ds-toolbar">
        <div className="ds-title">
          <h2>{def.title}</h2>
          {shown && <span className="pill">{rows.length} {rows.length === 1 ? def.noun[0] : def.noun[1]}</span>}
          {view && <TrafficLightTag tone={onSampleData(def.id) ? 'amber' : 'green'}><Server size={11} />{sourceLabel(def.id, view)}</TrafficLightTag>}
        </div>
        <div className="ds-actions">
          {changes > 0 && plan && <span className={`md-hint ${local.length ? 'bad' : ''}`}>{local.length ? `Fix ${local.length} ${local.length === 1 ? 'problem' : 'problems'} to save` : `${changeSummary(plan.result)} · Ctrl+S saves`}</span>}
          <button className="button secondary small" disabled={!changes || busy} onClick={() => { if (shown) setGrid(gridRowsOf(def.grid, shown.stored, gridRow)); setServer(null); }}><RotateCcw size={14} />Discard</button>
          <button className="button small" disabled={!changes || local.length > 0 || busy} onClick={save}><Save size={14} />{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
      <DrillFromBar from={params.get('from')} />
      {drill && drill.dropped.length > 0 && <Notice kind="warn">{DRILL_DROPPED}</Notice>}
      <div className="md-filter-panel">
        <form className="md-period" onSubmit={e => { e.preventDefault(); show(); }}>
          {def.selection.map(d => (
            <FieldControl key={d.field} def={d} variant="form" row={selection} lk={lk} onChange={(f, v) => setSelection(s => ({ ...s, [f]: v }))}
              onValueHelp={d.valueHelp && d.lookup ? () => setHelp(d) : undefined} />
          ))}
          <button className="button" type="submit" disabled={loading || busy || !view}>{loading ? <RefreshCw size={15} className="spin" /> : <ArrowRight size={15} />}Show</button>
          {shown && <div className="md-period-right"><span className="md-context">{selectionText}</span></div>}
        </form>
      </div>
      {view?.mode === 'local' && onSampleData(def.id) && <Notice>{SAMPLE_DATA_NOTE}</Notice>}
      {error && <Notice error><AlertCircle size={16} />{error}</Notice>}
      {(server || general.length > 0) && <Notice error><AlertCircle size={16} /><span>{server?.message ?? 'Some rows need attention.'}{general.length > 0 && <ul>{[...new Set(general)].map(m => <li key={m}>{m}</li>)}</ul>}</span></Notice>}
      {shown
        ? <EditGrid fields={def.grid} rows={grid} onRows={g => { setGrid(g); setServer(null); }} lk={lk} problems={problems} newRow={() => gridRow()}
            ariaLabel={def.title} cellClass={cellClass} footer={footer} className="md-table" />
        : <div className="empty"><Database size={26} /><h2>Choose a selection</h2><p>Pick {def.selection.map(d => labelOf(d)).join(' and ')} above, then press Show.</p></div>}
      <p className="panel-note">Paste rows from Excel into any cell · Enter moves down · F4 opens the value help. Every row is checked again on the server before it is saved.</p>
      {step === 'discard' && plan && <ConfirmDialog title="Discard changes?" message={`Your changes (${changeSummary(plan.result)}) are not saved yet.`} confirmLabel="Yes, Discard" danger
        onClose={() => setStep(null)} onConfirm={() => show(true)} />}
      {step === 'review' && plan && <ReviewDialog title={`Save ${def.title}`} fields={[]} before={{}} after={{}} lk={lk} busy={busy}
        summary={[changeSummary(plan.result)]} onBack={() => setStep(null)} onConfirm={() => void send()} />}
      {help?.lookup && <ValueHelpDialog title={`Select ${labelOf(help)}`} items={help.lookup(lk, selection)} onClose={() => setHelp(null)}
        onPick={code => { setSelection(s => ({ ...s, [help.field]: code })); setHelp(null); }} />}
      <Toast toast={toast} />
    </section>
  );
}
