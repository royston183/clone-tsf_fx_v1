import { useState, type ReactNode } from 'react';
import { ArrowUpRight, CalendarDays, RefreshCw } from 'lucide-react';
import { Link } from '@/lib/client/nav';
import { optionsFor, typeOf, type AnyField } from '@/lib/fields';
import { formatDate } from '@/lib/fields/parse';
import type { Row } from '@/lib/grid/types';
import type { Unit } from '@/lib/report/types';
import type { AnyDashboardDef } from '@/modules/types';
import { FieldControl } from '@/components/fields/FieldControl';
import { Modal } from '@/components/ui/Modal';

/** The fields an Overview's controls show: its key date (first date field) and its scope (first segmented field). */
export const overviewFields = (def: AnyDashboardDef): { keyDate?: AnyField; scope?: AnyField } => ({
  keyDate: def.selection.find(d => typeOf(d) === 'date'),
  scope: def.selection.find(d => typeOf(d) === 'segmented')
});

/**
 * The top of an Overview (Reporting's look): the key date bar with Change key date, then the controls panel — title,
 * description and Open full report, the scope toggle, the amount unit toggle, Refresh and the scope line.
 */
export function OverviewControls({ def, selection, lk, units, unit, system, fullReport, busy, source, onUnit, onSelect, onRefresh }: {
  def: AnyDashboardDef; selection: Row | null; lk: unknown; units: Unit[]; unit: Unit; system: string; fullReport: string | null; busy: boolean;
  /** Where the figures come from (a tag: SAP, sample data). */
  source?: ReactNode;
  onUnit: (id: string) => void; onSelect: (next: Row) => void; onRefresh: () => void;
}) {
  const { keyDate, scope } = overviewFields(def);
  const [dateDraft, setDateDraft] = useState<Row | null>(null);
  const current = selection ?? {};
  const scopeLine = def.overview?.scopeLine?.(current, lk);
  return (
    <>
      <section className="kit-ov-bar" aria-label="Key date">
        <div>
          {keyDate && <span>{keyDate.label.replace(/\s*\*$/, '')}<b>{current[keyDate.field] ? formatDate(current[keyDate.field]) : '—'}</b></span>}
          {system && <span>System<b>{system}</b></span>}
        </div>
        {keyDate && <button type="button" className="button secondary" disabled={!selection || busy} onClick={() => setDateDraft({ ...current })}><CalendarDays size={15} />Change key date</button>}
      </section>
      <section className="kit-card kit-ov-controls" aria-label="Dashboard selections">
        <div className="kit-card-head">
          <div><h2>{def.title}</h2>{def.overview?.description && <p>{def.overview.description}</p>}</div>
          {fullReport && <Link className="button secondary" href={fullReport}>Open full report<ArrowUpRight size={14} /></Link>}
        </div>
        <div className="kit-ov-toolbar">
          {scope ? <div className="kit-seg" role="group" aria-label={scope.label.replace(/\s*\*$/, '')}>
            {optionsFor(scope, lk).map(o => (
              <button key={o.value} type="button" aria-pressed={(current[scope.field] ?? '') === o.value} disabled={!selection || busy}
                onClick={() => onSelect({ ...current, [scope.field]: o.value })}>{o.label}</button>
            ))}
          </div> : <span />}
          <div className="kit-ov-toolbar-end">
            {units.length > 1 && <>
              <span className="kit-ov-label">Amounts in</span>
              <div className="kit-pills" role="group" aria-label="Amount unit">
                {units.map(u => <button key={u.id} type="button" aria-pressed={u.id === unit.id} onClick={() => onUnit(u.id)}>{u.label}</button>)}
              </div>
            </>}
            <button type="button" className="button secondary" disabled={!selection || busy} onClick={onRefresh}><RefreshCw size={15} className={busy ? 'spin' : undefined} />Refresh</button>
          </div>
        </div>
        <p className="kit-ov-scope">
          {keyDate && current[keyDate.field] && <>Key date <b>{formatDate(current[keyDate.field])}</b>{scopeLine ? ' · ' : ''}</>}{scopeLine}{source && <> {source}</>}
        </p>
      </section>
      {dateDraft && keyDate && (
        <Modal size="small" title="Change key date" subtitle="The dashboard reads its figures for this date." onClose={() => setDateDraft(null)} onPrimary={() => { if (dateDraft[keyDate.field]) { onSelect(dateDraft); setDateDraft(null); } }}
          footer={<>
            <button className="button secondary" onClick={() => setDateDraft(null)}>Cancel</button>
            <button className="button" disabled={!dateDraft[keyDate.field]} onClick={() => { onSelect(dateDraft); setDateDraft(null); }}>Apply</button>
          </>}>
          <FieldControl def={keyDate} variant="form" row={dateDraft} lk={lk} onChange={(f, v) => setDateDraft(d => ({ ...(d ?? {}), [f]: v }))} />
        </Modal>
      )}
    </>
  );
}
