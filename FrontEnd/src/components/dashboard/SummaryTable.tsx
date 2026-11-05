import { DataTable } from '@/components/table/DataTable';
import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { ColumnFormat, TableData } from '@/lib/dashboard/types';
import type { DrillTarget, Unit } from '@/lib/report/types';
import { isLinkTarget } from '@/lib/drill/target';
import { formatInUnit, formatPercent } from '@/lib/report/units';

const STRONG = new Set(['warn', 'total', 'subtotal', 'heading']);

/** A cell by its column's format: amounts in the unit (the default), counts grouped, percents, text as it is. */
export function cellText(format: ColumnFormat | undefined, v: string, unit: Unit, rowPercent = false): string {
  if (format === 'text') return v;
  if (format === 'count') return v === '' || !Number.isFinite(Number(v)) ? v : Number(v).toLocaleString('en-IN');
  if (format === 'percent' || rowPercent) return v === '' ? '' : formatPercent(v);
  return formatInUnit(v, unit);
}

/** A row with an open target is clickable as a whole; the label button inside keeps its own click (it stops the row's). */
export function rowLink(open: DrillTarget | undefined, onOpen: (target: DrillTarget) => void): { className: string; onClick?: () => void } {
  return isLinkTarget(open) ? { className: 'kit-row-link', onClick: () => onOpen(open) } : { className: '' };
}
/** The label button's click: opens once, without the row's click firing too. */
export const labelClick = (e: { stopPropagation: () => void }, open: DrillTarget, onOpen: (target: DrillTarget) => void) => { e.stopPropagation(); onOpen(open); };

/** The statement summary (ALM .ov-stmt): columns across, rows down; a column header opens its lines inline (.ov-drill). */
export function SummaryTable({ data, unit, onOpen }: { data: TableData; unit: Unit; onOpen: (target: DrillTarget) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const drill = open ? data.drill?.[open] : undefined;
  const column = data.columns.find(c => c.id === open);
  const t = drill?.target;
  const target = isLinkTarget(t) ? t : null;
  return (
    <>
      <div className="table-wrap ov-stmt-wrap"><DataTable nativeLayout nativeExport className="ds-table md-table ov-stmt">
        <thead><tr><th className="md-id">{data.rowHeader ?? unit.label}</th>{data.columns.map(c => (
          <th key={c.id} className={[c.format === 'text' ? '' : 'md-amt', c.accent ? 'kit-accent' : '', open === c.id ? 'on' : ''].filter(Boolean).join(' ')}>
            {data.drill?.[c.id] ? <button type="button" className="ov-bucket-btn" aria-expanded={open === c.id} onClick={() => setOpen(o => (o === c.id ? null : c.id))}>{c.label}</button> : c.label}
          </th>
        ))}</tr></thead>
        <tbody>{data.rows.map(r => { const link = rowLink(r.open, onOpen); return (
          <tr key={r.label} onClick={link.onClick} className={[r.style && STRONG.has(r.style) ? 'ov-strong' : '', r.style === 'total' ? 'kit-total' : '', link.className].filter(Boolean).join(' ') || undefined}>
            <td className="md-id">{isLinkTarget(r.open) ? <button type="button" className="kit-ov-link" onClick={e => r.open && labelClick(e, r.open, onOpen)}>{r.label}</button> : r.label}{r.sub && <small className="kit-sub"> {r.sub}</small>}</td>
            {data.columns.map(c => {
              const v = r.cells[c.id] ?? '';
              const cls = [c.format === 'text' ? '' : 'md-amt', v.startsWith('-') ? 'ov-neg-v' : '', c.accent ? 'kit-accent' : '', open === c.id ? 'on' : ''].filter(Boolean).join(' ');
              return <td key={c.id} className={cls}>{cellText(c.format, v, unit, r.style === 'percent')}</td>;
            })}
          </tr>
        ); })}</tbody>
      </DataTable></div>
      {data.footnote && <p className="kit-ov-footnote">{data.footnote}</p>}
      {drill && column && <div className="ov-drill" aria-label={`${column.label} lines`}>
        <h3>{column.label}</h3>
        <DataTable nativeLayout nativeExport className="ds-table"><thead><tr><th>Line</th><th className="md-amt">Amount</th></tr></thead>
          <tbody>{drill.lines.map(l => <tr key={l.label}><td>{l.label}</td><td className="md-amt">{formatInUnit(l.amount, unit)}</td></tr>)}</tbody></DataTable>
        {target && <button type="button" className="text-button" onClick={() => onOpen(target)}>{target.label}<ArrowRight size={14} /></button>}
      </div>}
    </>
  );
}
