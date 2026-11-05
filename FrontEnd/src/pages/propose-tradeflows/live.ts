// Propose Tradeflows on live data: Deal IDs and master contracts from the SLC middleware (through the BackEnd), BLs,
// trade flows and commodities from SAP (through the relay), SAP's exchange rates (type M), and the AI through the
// BackEnd (/api/ai/proposals). Every read and write goes through the data client.
import { backendApi } from '@/lib/client/backend-api';
import { moduleChange, moduleQuery, moduleView } from '@/lib/client/data';
import { str } from '@/lib/grid/grid';
import type { Row } from '@/lib/grid/types';
import { rankByCloseness, toUsd } from '@/lib/propose/match';
import { valueOf } from '@/modules/tradeflow/pricing';
import { loadExchangeRate } from '@/ref/shared/fx/exchange-rate-api';
import type { AiAnswer, Deal, ProposeData } from './data';

/** The deal amount's currency: the first one of the deal currency chain ("USD-USD-INR" → USD). */
export const dealCurrency = (chain: string): string => (/^([A-Z]{3})/.exec(str(chain).toUpperCase())?.[1] ?? '');

type Rate = { ExchangeRate: string | number; NumberOfSourceCurrencyUnits: string | number; NumberOfTargetCurrencyUnits: string | number };
/**
 * USD per unit of a currency from an SAP rate row (6 decimals): `inverse` when the row is USD → currency. A negative
 * rate is SAP's indirect quotation (units of the source per one target).
 */
export function usdPerUnit(row: Rate | null, inverse: boolean): string | null {
  if (!row) return null;
  const r = Number(row.ExchangeRate), from = Number(row.NumberOfSourceCurrencyUnits) || 1, to = Number(row.NumberOfTargetCurrencyUnits) || 1;
  if (!r) return null;
  // Target units for one source unit.
  const perSource = (r > 0 ? r : 1 / -r) * to / from;
  const usd = inverse ? 1 / perSource : perSource;
  return Number.isFinite(usd) && usd > 0 ? usd.toFixed(6) : null;
}

/** A TSF Deal ID as Propose needs it; its commodity is its master contract's (TSF FX commodity code). */
export function toDeal(row: Row, mcs: Map<string, { commodity: string; commodityDesc: string }>): Deal {
  const mc = mcs.get(str(row.mcRef));
  return {
    dealId: str(row.dealId), dealDesc: str(row.dealDesc), tsfCommodity: str(mc?.commodity), tsfCommodityText: str(mc?.commodityDesc),
    amount: str(row.dealAmount), currency: dealCurrency(str(row.dealCurrDesc))
  };
}

/** Each BL with its USD value: its quantity × its trade flow's price, converted from the price currency. */
export function blsWithUsd(bls: Row[], tfs: Row[], rates: Record<string, string>): Row[] {
  const tf = new Map(tfs.map(t => [`${t.tfNo}|${t.tfDate}`, t]));
  return bls.map(b => {
    const t = tf.get(`${b.tfNo}|${b.tfDate}`);
    const price = str(t?.price);
    const value = price && Number(price) > 0 ? valueOf(price, str(b.quantity)) : '';
    return { ...b, usdValue: value ? toUsd(value, str(t?.currency) || 'USD', rates) ?? '' : '' };
  });
}

/** Every row of a list (paged at the largest page size the list allows). */
async function all(id: string, table: string, pageSize: number): Promise<Row[]> {
  const rows: Row[] = [];
  for (let page = 1; ; page++) {
    const p = await moduleQuery(id, table, { page, pageSize });
    rows.push(...p.rows);
    if (rows.length >= p.total || !p.rows.length) return rows;
  }
}

const today = () => new Date().toISOString().slice(0, 10);

export function liveProposeData(): ProposeData {
  let ratesCache: Promise<Record<string, string>> | null = null;
  let dealCurrencies: string[] = [];
  const rates = () => (ratesCache ??= (async () => {
    const out: Record<string, string> = {};
    const tfs = await all('tradeflow', 'tradeflows', 200);
    const wanted = [...new Set([...dealCurrencies, ...tfs.map(t => str(t.currency))].filter(c => c && c !== 'USD'))];
    await Promise.all(wanted.map(async cur => {
      const direct = usdPerUnit(await loadExchangeRate(cur, 'USD', today(), 'M').catch(() => null), false);
      const rate = direct ?? usdPerUnit(await loadExchangeRate('USD', cur, today(), 'M').catch(() => null), true);
      if (rate) out[cur] = rate;
    }));
    return out;
  })());
  return {
    sample: false,
    async deals() {
      const [deals, mcs] = await Promise.all([all('tsf-deal-id', 'dealIds', 500), all('master-contract', 'contracts', 100)]);
      const byNo = new Map(mcs.map(m => [str(m.mcNo), { commodity: str(m.commodity), commodityDesc: str(m.commodityDesc) }]));
      const list = deals.filter(d => Number(d.dealAmount) > 0).map(d => toDeal(d, byNo));
      dealCurrencies = [...new Set(list.map(d => d.currency))];
      return list;
    },
    async bls() {
      const [view, tfs, r] = await Promise.all([moduleView('bl-assign'), all('tradeflow', 'tradeflows', 200), rates()]);
      return blsWithUsd(view.tables.bls ?? [], tfs, r);
    },
    async commodities() { return (await moduleView('commodity')).tables.commodities ?? []; },
    rates,
    async assign(dealId, usdByBl) {
      const bls = (await moduleView('bl-assign')).tables.bls ?? [];
      const rows = bls.filter(b => usdByBl[b.blNo] !== undefined).map(b => ({ ...b, dealId, assignedUsd: usdByBl[b.blNo] }));
      await moduleChange('bl-assign', 'bls', 'update', rows);
    },
    async unassign(blNo) {
      const bls = (await moduleView('bl-assign')).tables.bls ?? [];
      await moduleChange('bl-assign', 'bls', 'update', bls.filter(b => b.blNo === blNo).map(b => ({ ...b, dealId: '', assignedUsd: '' })));
    },
    async ai(request): Promise<AiAnswer> {
      try {
        return await backendApi<AiAnswer>('/ai/proposals', { method: 'POST', body: request });
      } catch (e) {
        // No key, the AI unreachable or declining: the app's own ranking, and why.
        const why = (e as Error).message || 'The AI is not available.';
        return { ranked: rankByCloseness(request.candidates).slice(0, 5).map(c => ({ index: request.candidates.indexOf(c), reason: `${why} Ranked by closeness.` })), rules: {}, notUnderstood: request.preferences.trim() ? [`${why} Preferences were not applied.`] : [], model: 'none' };
      }
    }
  };
}
