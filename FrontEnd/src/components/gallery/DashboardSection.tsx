import { useState } from 'react';
import { BarChart } from '@/components/dashboard/BarChart';
import { DonutChart } from '@/components/dashboard/DonutChart';
import { KpiTile } from '@/components/dashboard/KpiTile';
import { LineChart } from '@/components/dashboard/LineChart';
import { BarList } from '@/components/dashboard/BarList';
import { EntityCards } from '@/components/dashboard/EntityCards';
import { FlowChart } from '@/components/dashboard/FlowChart';
import { ShareBar } from '@/components/dashboard/ShareBar';
import { Link } from '@/lib/client/nav';
import { axisLabel } from '@/lib/dashboard/charts';
import { quarterLabel } from '@/lib/dashboard/periods';
import { RANGES, type Range, type Series, type Tile } from '@/lib/dashboard/types';
import { DEFAULT_UNITS } from '@/lib/report/types';
import { formatInUnit, formatPercent, unitNote } from '@/lib/report/units';
import { galleryItem } from './ids';

const LAKHS = DEFAULT_UNITS[2];
const TILES: Tile[] = [
  { label: 'Outflows', value: '24600000.00', type: 'amount', currency: 'INR', info: 'All outflow groups of the period.' },
  { label: 'Mismatch 1–7 days', value: '1.89', type: 'percent', meter: { value: '1.89', limit: '-10.00' }, rag: 'green', delta: { value: '+3.80 pts vs last month', good: 'up' } },
  { label: 'Mismatch 8–14 days', value: '-8.40', type: 'percent', meter: { value: '-8.40', limit: '-10.00' }, rag: 'amber', delta: { value: '−1.20 pts vs last month', good: 'up' } },
  { label: 'Mismatch up to 30 days', value: '-17.54', type: 'percent', meter: { value: '-17.54', limit: '-15.00' }, rag: 'red', info: 'Limit −15 %, amber from 80 % of it.' }
];
const MONTHS = ['Aug 25', 'Sep 25', 'Oct 25', 'Nov 25', 'Dec 25', 'Jan 26', 'Feb 26', 'Mar 26', 'Apr 26', 'May 26', 'Jun 26', 'Jul 26'];
const GAP = ['-17.72', '-13.67', '-9.69', '-5.77', '-1.91', '1.89', '3.10', '4.25', '-2.40', '-6.10', '-9.20', '-11.30'];
/** The quarter-end months of the sample (financial year from April): Sep 25, Dec 25, Mar 26, Jun 26. */
const QUARTER_ENDS = [{ i: 1, month: '09', year: '2025' }, { i: 4, month: '12', year: '2025' }, { i: 7, month: '03', year: '2026' }, { i: 10, month: '06', year: '2026' }];
const status = (y: string) => (Number(y) < -10 ? 'red' as const : Number(y) <= -8 ? 'amber' as const : undefined);
const point = (x: string, y: string) => ({ x, y, ...(status(y) ? { status: status(y) } : {}) });
/** The last n months, or for '4q' the last four quarters with quarter labels (Q2 FY26 …), as the Treasury sample shows them. */
const gap = (range: Range): Series[] => {
  const n = range === '3m' ? 3 : range === '12m' ? 12 : 6;
  const points = range === '4q' ? QUARTER_ENDS.map(q => point(quarterLabel(q.month, q.year, 4), GAP[q.i])) : GAP.slice(-n).map((y, i) => point(MONTHS.slice(-n)[i], y));
  return [{ name: '1–7 days', limit: '-10.00', points }];
};
const FLOWS: Series[] = [
  { name: 'Interest', points: MONTHS.slice(-6).map((x, i) => ({ x, y: `${(42 + i * 3) * 10000}.00` })) },
  { name: 'Repayment', points: MONTHS.slice(-6).map((x, i) => ({ x, y: `${(120 - i * 9) * 10000}.00` })) }
];
const amount = (v: string) => formatInUnit(v, LAKHS);
const lakhAxis = (t: number, ticks: number[]) => axisLabel(t, ticks, LAKHS.divisor);

/** Dashboard pieces (sub-project 3): KPI tiles in every RAG state and the three hand-drawn charts. */
export function DashboardSection() {
  const [range, setRange] = useState<Range>('6m');
  return (
    <section className="kit-gallery" aria-labelledby="g-dashboard"><h2 id="g-dashboard">Dashboard</h2>
      <div className="kit-gallery-grid">
        <article className="panel kit-gallery-item kit-gallery-wide" data-gallery-id="B-kpi-tile">
          <h3><span className="kit-id">B-kpi-tile</span>{galleryItem('B-kpi-tile').title}</h3>
          <p className="muted">Value with unit, limit meter, RAG badge (computed on the server), delta and an info pop-over.</p>
          <div className="ov-tiles">{TILES.map(t => <KpiTile key={t.label} tile={t} unit={LAKHS} />)}</div>
        </article>
        <article className="panel kit-gallery-item kit-gallery-wide" data-gallery-id="B-charts">
          <h3><span className="kit-id">B-charts</span>{galleryItem('B-charts').title}</h3>
          <p className="muted">Bars with a limit line and amber/red outlines, a range switch; lines; a donut. Hand-drawn SVG that follows day and night mode.</p>
          <div className="ov-trange" role="group" aria-label="Periods shown">
            {RANGES.map(r => <button key={r.id} type="button" className={r.id === range ? 'on' : ''} aria-pressed={r.id === range} onClick={() => setRange(r.id)}>{r.label}</button>)}
          </div>
          <div className="kit-dash-grid">
            <BarChart label="Mismatch 1–7 days" series={gap(range)} format={formatPercent} axisFormat={(t, ticks) => axisLabel(t, ticks)} />
            <LineChart label="Cash flows" series={FLOWS} format={amount} axisFormat={lakhAxis} note={unitNote(LAKHS)} />
            <DonutChart label="By product" slices={[{ label: '51A Term Loan', value: '5400000.00' }, { label: '52A Fixed Deposit', value: '2100000.00' }, { label: '53A Bond', value: '900000.00' }]} format={amount} note={unitNote(LAKHS)} />
          </div>
        </article>
        <article className="panel kit-gallery-item kit-gallery-wide" data-gallery-id="B-overview">
          <h3><span className="kit-id">B-overview</span>{galleryItem('B-overview').title}</h3>
          <p className="muted">Reusable company cards, a connected lifecycle, bar lists and a share breakdown. Counts and percentages stay unchanged when the amount unit changes.</p>
          <EntityCards entities={[{ code: '1000', name: 'Demo company', amount: '5400000', stats: [{ label: 'Deals', value: '24' }, { label: 'Payments due', value: '3' }] }]} unit={LAKHS} currency="INR" />
          <FlowChart label="Example lifecycle" root={{ label: 'Portfolio', title: 'Treasury', amount: '5400000' }} steps={[
            { label: 'Request', title: '4 requests', items: [{ name: 'Check documents', badge: '4' }] },
            { label: 'Approve', title: '2 approvals', tone: 'amber', items: [{ name: 'Credit approval', badge: '2' }] },
            { label: 'Settle', title: '18 deals', tone: 'green', items: [] }
          ]} expanded format={amount} />
          <div className="kit-dash-grid">
            <BarList label="By product" items={[{ label: 'Term loan', value: '5400000', note: '24 deals' }, { label: 'Working capital', value: '2100000', note: '8 deals' }]} format={amount} />
            <ShareBar label="Days past due" parts={[{ label: 'Current', value: '5400000', count: '24 deals', tone: 'green' }, { label: '1–30 days', value: '2100000', count: '8 deals', tone: 'amber' }]} format={amount} />
          </div>
          <Link className="text-button" href="/">Open the Overview ↗</Link>
        </article>
      </div>
    </section>
  );
}
