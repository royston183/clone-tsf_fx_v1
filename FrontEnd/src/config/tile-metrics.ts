import { moduleQuery, moduleView } from '@/lib/client/data';
import { cachedDashboard } from '@/lib/client/dashboard-cache';
import { formatDate } from '@/lib/fields/parse';
import type { Row } from '@/lib/grid/types';

/** A small live figure shown on an application tile, from that application's own data. Reads are cheap and best-effort. */
export interface TileMetric { load: () => Promise<string | null> }

const plural = (n: number, one: string, many: string): string => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
const text = (v: unknown): string => (typeof v === 'string' ? v : '');

export const countText = (total: number, one: string, many: string): string | null => (total > 0 ? plural(total, one, many) : null);

/** "10 trade flows · 980,566 USD": the value is shown only when every row is read and all share one currency. */
export function tradeFlowsText(rows: Row[], total: number): string | null {
  if (!(total > 0)) return null;
  const count = plural(total, 'trade flow', 'trade flows');
  const currencies = new Set(rows.map(r => text(r.currency)));
  const sum = rows.reduce((s, r) => s + (Number(r.value) || 0), 0);
  if (rows.length !== total || currencies.size !== 1 || !text(rows[0]?.currency) || !Number.isFinite(sum)) return count;
  return `${count} · ${Math.round(sum).toLocaleString('en-US')} ${text(rows[0].currency)}`;
}

export const latestDateText = (rows: Row[], field: string, label: string): string | null => {
  const dates = rows.map(r => text(r[field])).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  return dates.length ? `${label} ${formatDate(dates[dates.length - 1])}` : null;
};

// A page size must be one the module's list allows (the smallest of master-contract is 20).
// One read of the trade flows serves both of its tiles.
const tradeFlows = () => cachedDashboard('tile:tradeflows', () => moduleQuery('tradeflow', 'tradeflows', { page: 1, pageSize: 200, sort: { field: 'tfDate', dir: -1 } }));
const tableRows = async (module: string, table: string): Promise<Row[]> => (await cachedDashboard(`tile:view:${module}`, () => moduleView(module))).tables[table] ?? [];

export const TILE_METRICS: Record<string, TileMetric> = {
  'maintain-commodity': { load: async () => countText((await tableRows('commodity', 'commodities')).length, 'commodity', 'commodities') },
  'update-price': { load: async () => latestDateText(await tableRows('commodity-price', 'prices'), 'effectiveFrom', 'latest') },
  'tradeflows-list': { load: async () => { const p = await tradeFlows(); return tradeFlowsText(p.rows, p.total); } },
  'tradeflows-upload': { load: async () => latestDateText((await tradeFlows()).rows, 'tfDate', 'latest TF') },
  'fo-create-master-contract': {
    load: async () => countText((await cachedDashboard('tile:contracts', () => moduleQuery('master-contract', 'contracts', { page: 1, pageSize: 20 }))).total, 'contract', 'contracts')
  }
};

/** The figure for a catalogue node, or null: nothing fits, the read failed or there is no data. Never throws. */
export async function loadTileMetric(id: string): Promise<string | null> {
  const metric = Object.hasOwn(TILE_METRICS, id) ? TILE_METRICS[id] : undefined;
  if (!metric) return null;
  try { return await metric.load(); } catch { return null; }
}
