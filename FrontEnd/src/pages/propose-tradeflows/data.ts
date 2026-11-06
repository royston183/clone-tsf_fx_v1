// Propose Tradeflows: where its data comes from. The page talks only to a ProposeData: sample data now (UI approval),
// the live sources (Deal IDs and master contracts from the middleware, BLs and commodities from SAP, exchange rates,
// and the AI through the BackEnd) once they are connected.
import { str } from '@/lib/grid/grid';
import type { Row } from '@/lib/grid/types';
import type { Combination, Rules } from '@/lib/propose/match';
import type { Criterion } from '@/lib/propose/query';
import { checkAssignment } from './logic';
import { rankByCloseness } from '@/lib/propose/match';
import { tradeflowManageSeed } from '@/modules/tradeflow-manage/seed';
import { valueOf } from '@/modules/tradeflow/pricing';

/** A TSF Deal ID as Propose needs it: its commodity comes from its master contract (TSF FX commodity code). */
export interface Deal { dealId: string; dealDesc: string; tsfCommodity: string; tsfCommodityText: string; amount: string; currency: string }
/** What goes to the AI (and nothing more): the deal's figures and, per combination, its BLs' numbers and USD values. */
export interface AiRequest {
  deal: { dealId: string; tsfCommodity: string; dealUsd: string; remainingUsd: string };
  candidates: Combination[];
  bls: { blNo: string; tfNo: string; tfDate: string; quantity: string; usdValue: string }[];
  preferences: string;
}
export interface AiAnswer { ranked: { index: number; reason: string }[]; rules: Rules; criteria?: Criterion[]; acrossDeals?: boolean; notUnderstood: string[]; model: string }

export interface ProposeData {
  /** True while the page runs on its sample data. */
  sample: boolean;
  deals(): Promise<Deal[]>;
  /** Every BL with: blNo, blRecordDate, tfNo, tfDate, commodity, quantity, usdValue, dealId, assignedUsd, deletedFlag. */
  bls(): Promise<Row[]>;
  /** The commodity master: commodity, description, tsfCommodity. */
  commodities(): Promise<Row[]>;
  /** USD per unit of each currency (rate type M, today). */
  rates(): Promise<Record<string, string>>;
  /** Gives the BLs the Deal ID, each storing the USD it was matched with. */
  /**
   * With a `guard` the write first revalidates against the latest BL rows (not already assigned, same commodity, not
   * over the deal); SAP then refuses any row changed since it was read (ETag).
   */
  assign(dealId: string, usdByBl: Record<string, string>, guard?: { dealUsd: string; tsfCommodity: string; commodities: Row[] }): Promise<void>;
  unassign(blNo: string): Promise<void>;
  ai(request: AiRequest): Promise<AiAnswer>;
}

export const AI_OFFLINE = 'AI not connected (sample data): ranked by closeness to the amount left.';

/** Sample data: the Manage Tradeflows sample BLs, three commodities, four Deal IDs (one INR, one without a USD rate). */
export function sampleProposeData(): ProposeData {
  const { tables } = tradeflowManageSeed();
  const price = new Map(tables.tradeflows.map(t => [`${t.tfNo}|${t.tfDate}`, str(t.price)]));
  let bls: Row[] = tables.bl.map(b => {
    const p = price.get(`${b.tfNo}|${b.tfDate}`) ?? '';
    return { ...b, usdValue: p && Number(p) > 0 ? valueOf(p, str(b.quantity)) : '' };
  });
  const commodities: Row[] = [
    { commodity: 'ALMOND', description: 'Almonds', tsfCommodity: 'C130' },
    { commodity: 'COTTON', description: 'Cotton', tsfCommodity: 'C140' },
    { commodity: 'CASHEW', description: 'Cashew kernels', tsfCommodity: '' }
  ];
  const deals: Deal[] = [
    { dealId: 'DL26000101', dealDesc: 'Almond forward, October shipments', tsfCommodity: 'C130', tsfCommodityText: 'ALMOND', amount: '189200.00', currency: 'USD' },
    { dealId: 'DL26000142', dealDesc: 'Almond INR deal, OSIPL', tsfCommodity: 'C130', tsfCommodityText: 'ALMOND', amount: '23650000.00', currency: 'INR' },
    { dealId: 'DL26000150', dealDesc: 'Cotton forward', tsfCommodity: 'C140', tsfCommodityText: 'COTTON', amount: '36000.00', currency: 'USD' },
    { dealId: 'DL26000160', dealDesc: 'Almond VND deal', tsfCommodity: 'C130', tsfCommodityText: 'ALMOND', amount: '2400000000.00', currency: 'VND' }
  ];
  return {
    sample: true,
    deals: async () => deals.map(d => ({ ...d })),
    bls: async () => bls.map(b => ({ ...b })),
    commodities: async () => commodities.map(c => ({ ...c })),
    rates: async () => ({ INR: '0.0120' }),
    assign: async (dealId, usdByBl, guard) => {
      if (guard) { const problem = checkAssignment(guard, dealId, usdByBl, bls); if (problem) throw new Error(problem); }
      bls = bls.map(b => (usdByBl[b.blNo] !== undefined ? { ...b, dealId, assignedUsd: usdByBl[b.blNo] } : b));
    },
    unassign: async blNo => { bls = bls.map(b => (b.blNo === blNo ? { ...b, dealId: '', assignedUsd: '' } : b)); },
    ai: async request => ({
      ranked: rankByCloseness(request.candidates).slice(0, 5).map(c => ({ index: request.candidates.indexOf(c), reason: AI_OFFLINE })),
      rules: {},
      notUnderstood: request.preferences.trim() ? ['AI not connected: preferences are applied once Claude is connected.'] : [],
      model: 'none'
    })
  };
}
