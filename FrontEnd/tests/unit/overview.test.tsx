import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { BarList } from '@/components/dashboard/BarList';
import { EntityCards } from '@/components/dashboard/EntityCards';
import { FlowChart } from '@/components/dashboard/FlowChart';
import { ShareBar } from '@/components/dashboard/ShareBar';
import { cellText } from '@/components/dashboard/SummaryTable';
import { dataKindOf } from '@/lib/dashboard/types';
import { DEFAULT_UNITS } from '@/lib/report/types';
import { formatInUnit, sumAmounts } from '@/lib/report/units';
import { dashboardService } from '@core/server/dashboard-service';
import { portfolio } from '@/modules/samples/portfolio/definition';
import { portfolioSeed } from '@/modules/samples/portfolio/seed';
import { actingAs, freshConfig } from '../support/platform';

const CRORES = DEFAULT_UNITS[3];
const selection = { keyDate: '2026-10-27', company: '' };
const amount = (v: string) => formatInUnit(v, CRORES);

describe('the portfolio sample (every dashboard part, a pattern for an Overview, never one to copy)', () => {
  beforeEach(() => { freshConfig(); });
  it('loads every section with its expected data kind and reconciles company, KPI and summary totals', async () => {
    const result = await dashboardService(freshConfig(), 'sample-portfolio').load(actingAs(), selection);
    for (const section of portfolio.sections) {
      const r = result.sections[section.id];
      expect(r, section.id).toHaveProperty('data.kind', dataKindOf(section));
    }
    const entities = result.sections.companies, kpis = result.sections.kpis, summary = result.sections.summary;
    if (!('data' in entities) || entities.data.kind !== 'entities' || !('data' in kpis) || kpis.data.kind !== 'tiles' || !('data' in summary) || summary.data.kind !== 'table') throw new Error('Missing portfolio data');
    const total = sumAmounts(entities.data.entities.map(e => e.amount));
    expect(kpis.data.tiles[0].value).toBe(total);
    expect(summary.data.rows.at(-1)?.cells.outstanding).toBe(total);
    expect(summary.data.rows.at(-1)?.cells.deals).toBe(kpis.data.tiles[1].value);
  });
  it('applies the company code and key date to the underlying deals', async () => {
    const sel = { keyDate: '2026-06-30', company: '2000' };
    const expected = portfolioSeed().tables.deals.filter(r => r.company === sel.company && r.start <= sel.keyDate && sel.keyDate <= r.end);
    const result = await dashboardService(freshConfig(), 'sample-portfolio').load(actingAs(), sel);
    const kpis = result.sections.kpis;
    if (!('data' in kpis) || kpis.data.kind !== 'tiles') throw new Error('No KPIs');
    expect(kpis.data.tiles[0].value).toBe(sumAmounts(expected.map(r => r.amount)));
    expect(kpis.data.tiles[1].value).toBe(String(expected.length));
    const companies = result.sections.companies;
    if (!('data' in companies) || companies.data.kind !== 'entities') throw new Error('No company cards');
    expect(companies.data.entities.map(e => e.code)).toEqual(['2000']);
  });
  it('scales amounts without scaling counts, percentages or codes', () => {
    expect(cellText(undefined, '12500000', CRORES)).toBe('1.25');
    expect(cellText('count', '1234', CRORES)).toBe('1,234');
    expect(cellText('percent', '53.50', CRORES)).toBe('53.50 %');
    expect(cellText('text', '0010', CRORES)).toBe('0010');
  });
  it('keeps empty charts useful, and only renders flow items when expanded', () => {
    expect(renderToStaticMarkup(<BarList label="Products" items={[]} format={amount} />)).toContain('No figures');
    expect(renderToStaticMarkup(<ShareBar label="Ageing" parts={[{ label: 'Current', value: '0' }]} format={amount} />)).toContain('No figures');
    const props = { label: 'Lifecycle', root: { label: 'Portfolio', title: 'Deals' }, steps: [{ label: 'Approve', title: '2 approvals', items: [{ name: 'Credit check', badge: '2' }] }], format: amount };
    expect(renderToStaticMarkup(<FlowChart {...props} expanded />)).toContain('Credit check');
    expect(renderToStaticMarkup(<FlowChart {...props} expanded={false} />)).not.toContain('Credit check');
    const card = renderToStaticMarkup(<EntityCards entities={[{ code: '1000', name: 'Demo', amount: '12500000', stats: [{ label: 'Deals', value: '1234' }] }]} unit={CRORES} />);
    expect(card).toContain('1.25');
    expect(card).toContain('1234');
  });
});
