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
import { describeCriteria, readConditions, type Criteria, mergeCriteria } from '@/lib/propose/query';
import type { AiAnswer, AskAnswer, Deal, Interpretation, ProposeData } from './data';
import { assignmentProblems } from './logic';

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
  let dealsCache: Promise<Deal[]> | null = null;
  // The Deal IDs are read once; the rates wait for them, so every deal currency gets its rate.
  const deals = () => (dealsCache ??= (async () => {
    const [list, mcs] = await Promise.all([all('tsf-deal-id', 'dealIds', 500), all('master-contract', 'contracts', 100)]);
    const byNo = new Map(mcs.map(m => [str(m.mcNo), { commodity: str(m.commodity), commodityDesc: str(m.commodityDesc) }]));
    return list.filter(d => Number(d.dealAmount) > 0).map(d => toDeal(d, byNo));
  })());
  const rates = () => (ratesCache ??= (async () => {
    const out: Record<string, string> = {};
    const [tfs, dealList] = await Promise.all([all('tradeflow', 'tradeflows', 200), deals()]);
    const wanted = [...new Set([...dealList.map(d => d.currency), ...tfs.map(t => str(t.currency))].filter(c => c && c !== 'USD'))];
    await Promise.all(wanted.map(async cur => {
      const direct = usdPerUnit(await loadExchangeRate(cur, 'USD', today(), 'M').catch(() => null), false);
      const rate = direct ?? usdPerUnit(await loadExchangeRate('USD', cur, today(), 'M').catch(() => null), true);
      if (rate) out[cur] = rate;
    }));
    return out;
  })());
  return {
    sample: false,
    deals,
    async bls() {
      const [view, tfs, r] = await Promise.all([moduleView('bl-assign'), all('tradeflow', 'tradeflows', 200), rates()]);
      return blsWithUsd(view.tables.bls ?? [], tfs, r);
    },
    async commodities() { return (await moduleView('commodity')).tables.commodities ?? []; },
    rates,
    async assign(target, usdByBl, values) {
      // Read again from SAP now: what was free when the proposal was shown may have been taken since.
      const bls = (await moduleView('bl-assign')).tables.bls ?? [];
      const problems = assignmentProblems(target, usdByBl, Object.keys(usdByBl), bls, values);
      if (problems.length) throw new Error(`Not assigned: ${problems.join(' ')} Refresh to see the current BLs.`);
      // The fresh rows carry their ETags: SAP refuses the write (409) if any of them changes before it lands.
      const rows = bls.filter(b => usdByBl[b.blNo] !== undefined).map(b => ({ ...b, dealId: target.dealId, assignedUsd: usdByBl[b.blNo] }));
      await moduleChange('bl-assign', 'bls', 'update', rows);
    },
    async interpret(text, context): Promise<Interpretation> {
      const own = readConditions(text, context.commodities, { known: context.known, today: context.today });
      if (!own.notUnderstood.length) return { ...own, model: 'none' };
      // Only what the app could not read goes to the AI; its criteria are checked by the BackEnd and here again.
      try {
        const ai = await backendApi<{ criteria: Criteria; notUnderstood: string[]; model: string }>('/ai/interpret', {
          method: 'POST', body: { text, deal: context.deal, commodities: context.commodities.map(c => ({ commodity: str(c.commodity), description: str(c.description), tsfCommodity: str(c.tsfCommodity) })), today: context.today }
        });
        // The app's own reading stays (dates, ranges, references, targets); the AI adds what it placed.
        const both = mergeCriteria([own.criteria, ai.criteria]);
        return { criteria: both, applied: describeCriteria(both), notUnderstood: ai.notUnderstood, model: ai.model };
      } catch (e) {
        return { ...own, notUnderstood: own.notUnderstood.map(n => `${n} (${(e as Error).message || 'the AI is not available'})`), model: 'none' };
      }
    },
    async ai(request): Promise<AiAnswer> {
      try {
        return await backendApi<AiAnswer>('/ai/proposals', { method: 'POST', body: request });
      } catch (e) {
        // No key, the AI unreachable or declining: the app's own ranking, and why.
        const why = (e as Error).message || 'The AI is not available.';
        return { ranked: rankByCloseness(request.candidates).slice(0, 5).map(c => ({ index: request.candidates.indexOf(c), reason: `${why} Ranked by closeness.` })), rules: {}, notUnderstood: request.preferences.trim() ? [`${why} Preferences were not applied.`] : [], model: 'none' };
      }
    },
    async ask(request): Promise<AskAnswer> {
      try {
        return await backendApi<AskAnswer>('/ai/ask', { method: 'POST', body: request });
      } catch (e) {
        return { answer: `${(e as Error).message || 'The AI is not available.'} The question was not answered.`, rules: {}, notUnderstood: [], model: 'none' };
      }
    }
  };
}
