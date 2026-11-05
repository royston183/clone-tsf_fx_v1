import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { applicationPages, type CatalogNode } from '@/config/catalog';
import { clearDashboardCache } from '@/lib/client/dashboard-cache';
import { Tile as TileBare } from '@/components/ui/Tile';
import { NavProvider } from '@/lib/client/nav';
const Tile = (p: Parameters<typeof TileBare>[0]) => <NavProvider><TileBare {...p} /></NavProvider>;

const data = vi.hoisted(() => ({ moduleQuery: vi.fn(), moduleView: vi.fn() }));
vi.mock('@/lib/client/data', () => data);
import { countText, latestDateText, loadTileMetric, TILE_METRICS, tradeFlowsText } from '@/config/tile-metrics';

beforeEach(() => { vi.stubGlobal('location', { pathname: '/', search: '' }); });
afterEach(() => { vi.unstubAllGlobals(); clearDashboardCache(); data.moduleQuery.mockReset(); data.moduleView.mockReset(); });
const ids = (nodes: CatalogNode[]): string[] => nodes.flatMap(n => [n.id, ...ids(n.children ?? [])]);

describe('tile metric formatters', () => {
  it('counts with the right noun and hides zero', () => {
    expect(countText(1, 'commodity', 'commodities')).toBe('1 commodity');
    expect(countText(3, 'commodity', 'commodities')).toBe('3 commodities');
    expect(countText(0, 'commodity', 'commodities')).toBeNull();
  });
  it('sums trade-flow value only for one currency and a complete read', () => {
    const rows = [{ value: '500000.4', currency: 'USD' }, { value: '480566', currency: 'USD' }];
    expect(tradeFlowsText(rows, 2)).toBe('2 trade flows · 980,566 USD');
    expect(tradeFlowsText(rows, 5)).toBe('5 trade flows');
    expect(tradeFlowsText([...rows, { value: '1', currency: 'EUR' }], 3)).toBe('3 trade flows');
    expect(tradeFlowsText([], 0)).toBeNull();
  });
  it('shows the latest date', () => {
    expect(latestDateText([{ d: '2026-10-01' }, { d: '2026-11-05' }, { d: '' }], 'd', 'latest')).toBe('latest 05-11-2026');
    expect(latestDateText([], 'd', 'latest')).toBeNull();
  });
});

describe('tile metric registry', () => {
  it('only names catalogue applications', () => {
    const all = new Map<string, CatalogNode>();
    const walk = (nodes: CatalogNode[]) => nodes.forEach(n => { all.set(n.id, n); walk(n.children ?? []); });
    walk(applicationPages);
    for (const id of Object.keys(TILE_METRICS)) expect(all.get(id)?.type, id).toBe('application');
    expect(ids(applicationPages)).toContain('tradeflows-list');
  });
  it('loads figures through the data client and shares the trade-flow read', async () => {
    data.moduleQuery.mockResolvedValue({ rows: [{ value: '10', currency: 'USD', tfDate: '2026-11-05' }], total: 1, page: 1, pageSize: 200 });
    expect(await loadTileMetric('tradeflows-list')).toBe('1 trade flow · 10 USD');
    expect(await loadTileMetric('tradeflows-upload')).toBe('latest TF 05-11-2026');
    expect(data.moduleQuery).toHaveBeenCalledTimes(1);
  });
  it('returns null on error, for unknown ids and for ids that merely look inherited', async () => {
    data.moduleView.mockRejectedValue(new Error('relay down'));
    expect(await loadTileMetric('maintain-commodity')).toBeNull();
    expect(await loadTileMetric('nope')).toBeNull();
    expect(await loadTileMetric('constructor')).toBeNull();
  });
});

describe('Tile', () => {
  const node = { id: 'maintain-commodity', title: 'Maintain Commodity', type: 'application', description: 'd' } as CatalogNode;
  it('shows the metric when given and nothing otherwise', () => {
    expect(renderToStaticMarkup(<Tile node={node} href="/x" metric="3 commodities" />)).toContain('<span class="tile-metric" title="3 commodities">3 commodities</span>');
    expect(renderToStaticMarkup(<Tile node={node} href="/x" metric={null} />)).not.toContain('tile-metric');
    expect(renderToStaticMarkup(<Tile node={node} href="/x" />)).not.toContain('tile-metric');
  });
});
