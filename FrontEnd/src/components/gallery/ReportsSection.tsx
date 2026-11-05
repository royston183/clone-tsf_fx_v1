import { DrillFromBar } from '@/components/report/DrillFromBar';
import { ReportGrid } from '@/components/report/ReportGrid';
import { ReportOverview } from '@/components/report/ReportOverview';
import { SelectionPanel } from '@/components/report/SelectionPanel';
import type { Row } from '@/lib/grid/types';
import { DEFAULT_UNITS, type FormattedReport, type RowStyle } from '@/lib/report/types';
import { galleryItem } from './ids';

const STYLES: RowStyle[] = ['heading', 'level1', 'normal', 'subtotal', 'total', 'percent', 'warn'];
const REPORT: FormattedReport = {
  variant: 'formatted', entity: 'rows', idField: 'id', idLabel: 'Group ID', parent: { by: 'prefix', separator: ':' }, style: r => r.style as RowStyle,
  columns: [
    { id: 'name', label: 'Group Name', type: 'text' },
    { id: 'b1', label: '1–7 days', subHeader: 'B1', type: 'amount', drillable: true },
    { id: 'total', label: 'Total', subHeader: 'Total', type: 'amount', drillable: true }
  ]
};
const ROWS: Row[] = STYLES.map((style, i) => ({
  id: `R${i + 1}`, name: `${style} row`, style,
  b1: style === 'percent' ? '-17.54' : `${(i + 1) * 125000}.00`, total: style === 'percent' ? '' : `${(i + 1) * 250000}.00`
}));

/** Report pieces (sub-project 3): row styles of a formatted report and the "Opened from" bar of a drill. */
export function ReportsSection() {
  return (
    <section className="kit-gallery" aria-labelledby="g-reports"><h2 id="g-reports">Reports</h2>
      <div className="kit-gallery-grid">
        <article className="panel kit-gallery-item kit-gallery-wide" data-gallery-id="B-report-overview">
          <h3><span className="kit-id">B-report-overview</span>{galleryItem('B-report-overview').title}</h3>
          <ReportOverview title="Portfolio report" selection="Company 1000 · 31-03-2026" output="24 positions · Totals by currency · Open transaction details" ready />
        </article>
        <article className="panel kit-gallery-item kit-gallery-wide" data-gallery-id="B-report-selection">
          <h3><span className="kit-id">B-report-selection</span>{galleryItem('B-report-selection').title}</h3>
          <SelectionPanel summary="Selections remain available before and after running a report."><label className="field"><span>Key date</span><input type="date" defaultValue="2026-03-31" /></label></SelectionPanel>
        </article>
        <article className="panel kit-gallery-item" data-gallery-id="F-row-styles">
          <h3><span className="kit-id">F-row-styles</span>{galleryItem('F-row-styles').title}</h3>
          <p className="muted">heading, level1, normal, subtotal, total, percent and warn rows as SAP formats them; underlined cells drill; one row outlined after Back to report.</p>
          <ReportGrid title="Row styles" report={REPORT} rows={ROWS} unit={DEFAULT_UNITS[0]} drillable={() => true} onDrill={() => {}} highlight="R3" />
        </article>
        <article className="panel kit-gallery-item" data-gallery-id="B-drill-from">
          <h3><span className="kit-id">B-drill-from</span>{galleryItem('B-drill-from').title}</h3>
          <p className="muted">Shown on a screen reached by a drill; the link goes back to the report, which runs again.</p>
          <DrillFromBar from="/samples/monthly-amounts?s.company=1000&s.month=01&s.year=2026" />
        </article>
      </div>
    </section>
  );
}
