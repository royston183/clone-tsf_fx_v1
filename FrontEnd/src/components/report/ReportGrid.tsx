import { DataTable, columnsFor } from '@/components/table/DataTable';
import { StatusValue } from '@/components/ui/StatusValue';
import type { KeyboardEvent } from 'react';
import type { Row } from '@/lib/grid/types';
import { cellText, ROW_CLASS, rowStyleOf } from '@/lib/report/report';
import type { FormattedReport, Unit } from '@/lib/report/types';

const cx = (...xs: (string | false | undefined)[]) => xs.filter(Boolean).join(' ') || undefined;
const numeric = (type: string) => type === 'amount' || type === 'percent' || type === 'rate';

export interface ReportGridProps {
  nativeExport?: boolean;
  title: string;
  report: FormattedReport;
  rows: Row[];
  unit: Unit;
  /** Whether a click drills: the id cell (column null) or an amount cell. */
  drillable?: (row: Row, column: string | null) => boolean;
  onDrill?: (row: Row, column: string | null) => void;
  /** Row id outlined after "Back to report" (?hl=). */
  highlight?: string | null;
}

/** A report SAP formats (spec §3.3): ALM's .qr-table with its row styles, an optional second header line and drill cells. */
export function ReportGrid({ title, report, rows, unit, drillable = () => false, onDrill, highlight = null, nativeExport = false }: ReportGridProps) {
  const second = report.columns.some(c => c.subHeader);
  const onEnter = (run: () => void) => (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); run(); } };
  return (
    <div className="table-wrap ds-table-wrap md-wrap qr-full">
      <DataTable nativeExport={nativeExport} columns={[{ kind: 'code' }, ...columnsFor(report.columns)]} className="ds-table md-table qr-table" aria-label={title}>
        <thead>
          <tr>
            <th className="md-id">{report.idLabel ?? 'ID'}</th>
            {report.columns.map(c => <th key={c.id} className={numeric(c.type) ? 'md-amt' : c.type === 'text' ? 'md-name' : undefined}>{c.label}</th>)}
          </tr>
          {second && <tr className="qr-xbrl"><td className="md-id" />{report.columns.map(c => <td key={c.id} className={numeric(c.type) ? 'md-amt' : undefined}>{c.subHeader ?? ''}</td>)}</tr>}
        </thead>
        <tbody>{rows.map(r => {
          const id = r[report.idField] ?? '';
          const style = rowStyleOf(report, r);
          const idDrill = Boolean(onDrill) && drillable(r, null);
          return (
            <tr key={id} data-row={id} className={ROW_CLASS[style] || undefined}>
              <td className={cx('ds-code md-id', highlight === id && 'qr-drilled')}>
                {idDrill ? <button type="button" className="qr-drill" onClick={() => onDrill?.(r, null)}>{id}</button> : id}
              </td>
              {report.columns.map(c => {
                const can = Boolean(onDrill && c.drillable) && drillable(r, c.id);
                return (
                  <td key={c.id} className={cx(numeric(c.type) && 'md-amt', can && 'qr-drillable')} tabIndex={can ? 0 : undefined}
                    onClick={can ? () => onDrill?.(r, c.id) : undefined} onKeyDown={can ? onEnter(() => onDrill?.(r, c.id)) : undefined}>
                    <StatusValue definition={c} row={r}>{cellText(c, r, unit, style === 'percent')}</StatusValue>
                  </td>
                );
              })}
            </tr>
          );
        })}</tbody>
      </DataTable>
    </div>
  );
}
