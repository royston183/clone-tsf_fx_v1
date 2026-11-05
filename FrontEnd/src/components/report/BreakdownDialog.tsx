import { useEffect, useId, useRef, type ReactNode } from 'react';
import { DataTable } from '@/components/table/DataTable';
import { ArrowLeft } from 'lucide-react';
import { reportBreakdown } from '@/lib/client/data';
import { usePost } from '@/lib/client/use-post';
import type { DrillLevel } from '@/lib/drill/params';
import type { Row } from '@/lib/grid/types';
import { amountColumnOf, cellText } from '@/lib/report/report';
import type { FormattedReport, Unit } from '@/lib/report/types';
import { formatInUnit, isZero, sumAmounts } from '@/lib/report/units';
import { Loading } from '@/components/ui/Loading';
import { FootActions, Modal, RecordHeading } from '@/components/ui/Modal';
import { Notice } from '@/components/ui/Notice';

export const GONE = 'This row is no longer in the report.';

export interface BreakdownBodyProps {
  moduleId: string;
  report: FormattedReport;
  /** The selection the report ran with (the server reads the report again for it). */
  selection: Row;
  /** The report's rows, for the name of the row in the title. */
  rows: Row[];
  stack: DrillLevel[];
  unit: Unit;
  canDrill: (row: Row, column: string | null) => boolean;
  onDrill: (row: Row, column: string | null) => void;
  onBack: () => void;
}
export interface BreakdownDialogProps extends BreakdownBodyProps { onClose: () => void }

/** The parts of a breakdown (spec §5.1): the children of a row in the clicked column, their sum and the report amount. */
function useBreakdown({ moduleId, report, selection, rows, stack, unit, canDrill, onDrill, onBack }: BreakdownBodyProps) {
  const level = stack[stack.length - 1];
  const column = report.columns.find(c => c.id === level.column) ?? amountColumnOf(report);
  const res = usePost(reportBreakdown, moduleId, { selection, rowId: level.row, column: level.column });
  const nameCol = report.columns.find(c => c.type === 'text');
  const known = rows.find(r => r[report.idField] === level.row);
  const name = known && nameCol ? known[nameCol.id] : '';
  const value = (r: Row) => (column ? r[column.id] ?? '' : '');
  const shown = res.data ? res.data.rows.filter(r => !isZero(value(r))) : [];
  const span = nameCol ? 2 : 1;
  const title = name ? `${level.row} · ${name}` : level.row;
  const subtitle = `${column?.label ?? 'Total'} · amounts in ${unit.label}`;
  const back = stack.length > 1 ? <button type="button" className="button secondary" onClick={onBack}><ArrowLeft size={14} />Back to {stack[stack.length - 2].row}</button> : null;
  const content = (
    <>
      {res.loading && <Loading text="Loading the breakdown…" />}
      {res.error && (res.error.status === 404
        ? <p className="qr-drill-text">{GONE}</p>
        : <Notice error action={{ label: 'Retry', onClick: res.retry }}>{res.error.message}</Notice>)}
      {res.data && column && (shown.length
        ? <DataTable className="ds-table md-table qr-drill-table">
            <thead><tr><th>{report.idLabel ?? 'ID'}</th>{nameCol && <th>{nameCol.label}</th>}<th className="md-amt">{column.label}</th></tr></thead>
            <tbody>{shown.map(r => {
              const id = r[report.idField] ?? '';
              return (
                <tr key={id}>
                  <td className="ds-code">{canDrill(r, column.id) ? <button type="button" className="qr-drill" onClick={() => onDrill(r, column.id)}>{id}</button> : id}</td>
                  {nameCol && <td>{r[nameCol.id]}</td>}
                  <td className="md-amt">{cellText(column, r, unit)}</td>
                </tr>
              );
            })}</tbody>
            <tfoot>
              <tr><td colSpan={span}>Sum</td><td className="md-amt">{formatInUnit(sumAmounts(shown.map(value)), unit)}</td></tr>
              <tr><td colSpan={span}>Report amount</td><td className="md-amt">{formatInUnit(value(res.data.row) || '0.00', unit)}</td></tr>
            </tfoot>
          </DataTable>
        : <p className="qr-drill-text">No rows below {level.row} have an amount in {column.label}.</p>)}
    </>
  );
  return { title, subtitle, back, content };
}

/** ALM's drill panel as a pop-up. */
export function BreakdownDialog(p: BreakdownDialogProps) {
  const { title, subtitle, back, content } = useBreakdown(p);
  return (
    <Modal wide title={title} subtitle={subtitle} onClose={p.onClose} footerStart={back}
      footer={<button className="button secondary" onClick={p.onClose}>Close</button>}>
      {content}
    </Modal>
  );
}

/** The same breakdown as a page in place of the report (the caller adds the way back to the report). */
export function BreakdownBody(p: BreakdownBodyProps & { footer?: ReactNode }) {
  const { title, subtitle, back, content } = useBreakdown(p);
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); heading.current?.scrollIntoView?.(); }, []);
  return (
    <section className="kit-record-page" aria-labelledby={titleId}>
      <header className="kit-record-page-head"><RecordHeading title={title} subtitle={subtitle} titleId={titleId} titleRef={heading} /></header>
      <div className="kit-record-page-body">{content}</div>
      {(back || p.footer) && <FootActions className="kit-record-page-foot" footerStart={back} footer={p.footer} />}
    </section>
  );
}
