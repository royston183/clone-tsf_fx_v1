// DE6 TSF FX Blotter: the SAP writes of Auto-create Deals and Release to MO. Every call is the reference program's
// (src/ref/features/fx-blotter): FxTransaction POST (BAPI_FTR_FXT_DEALCREATE) and the application data TrmFxApp
// (ZSGTSFTR_APP_STR) through the relay; the Deal ID (ZSGTSFTR_DEALID, number range ZSGTSFNR01) and the master contract
// status through the middleware. This file only turns the page's rows into the reference's rows and back.
//
// The flow (decided 2026-11-06): Auto-create Deals books Deal 1 and Deal 2 in SAP (TXN_STATUS 01, with the master
// contract reference, no Deal ID). Selecting both and Release to MO draws the Deal ID, links Deal 1 / Deal 2, moves the
// master contract to 04 and writes the Deal ID with TXN_STATUS 03 on both legs. Legs that already carry a Deal ID are
// released (03) without a second one.
import { confirmAutoDeal, initAutoLegs, mcBalance, recalcAutoLeg, validateAutoLegs, autoEligible } from '@/ref/features/fx-blotter/logic';
import { createPairDealId, isInSap } from '@/ref/features/fx-blotter/dealIds';
import { createBlotterDeal, releaseBlotterRows, type Booked, type SaveOutcome } from '@/ref/features/fx-blotter/workflow';
import { sapMessage } from '@/ref/features/fx-blotter/api';
import { fxList } from '@/ref/shared/fx/mw';
import { ENTITIES, entityOf, INITIAL_COUNTERS, modelOf, TRADERS, FIXING_REFERENCES, txnTypeOf } from '@/ref/features/fx-blotter/data';
import { installMasters, loadBlotterMasters } from '@/ref/features/fx-blotter/masters';
import type { AutoLeg, Blotter, BlotterRow as RefRow, MasterContract } from '@/ref/features/fx-blotter/types';
import type { BlotterRow } from './data';

export type { AutoLeg, MasterContract };
export { autoEligible, mcBalance, recalcAutoLeg, validateAutoLegs };

/** The masters the Auto Deal and the Deal ID need (models, entities, fixing references) and the usable contracts. */
export interface AutoMasters { contracts: MasterContract[]; origins: string[]; fixRefs: string[] }

/** Reads the middleware masters, puts them where the reference's rules look for them, and returns the contracts. */
export async function loadAutoMasters(signal?: AbortSignal): Promise<AutoMasters> {
  const m = await loadBlotterMasters(signal);
  installMasters(m);
  return {
    contracts: m.contracts,
    origins: ENTITIES.filter(e => e.origin).map(e => e.code),
    fixRefs: [...new Set(FIXING_REFERENCES.map(f => f.code))]
  };
}

/** Deal 1 / Deal 2 of a contract by its model (entity, transaction type and sides per leg); rates are left to the trader. */
export const autoLegs = (mc: MasterContract, blotterDate: string): AutoLeg[] => initAutoLegs(mc, dateOf(blotterDate));

export const isNdfType = (txnType: string): boolean => Boolean(txnTypeOf(txnType)?.ndf);

const dateOf = (iso: string): Date => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const iso = (d: Date | null | undefined): string => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '');

/** The reference's trader code for a trader name (it finds the SAP trader code by that name), or ''. */
const refTrader = (name: string): string => TRADERS.find(t => t.name.trim().toLowerCase() === name.trim().toLowerCase())?.code ?? '';

/**
 * The trader the deals are booked under: the code chosen on the blotter (written as Ztrcode and the Deal ID's ZTRD_CODE,
 * so the blotter and the MO queue find the deal under it) and the name shown next to it.
 */
export interface Trader { code: string; name: string }

/**
 * The trader's short name for the Deal ID description (<trader>_<origin>_<year>/<entities>): ZTRADER of ZSGTRMTR_TRADER
 * for the code, else for the full name (ZNAME), else the name as shown. The masters can disagree (the blotter's trader
 * list and ZSGTRMTR_TRADER), so the code is never taken from the name here.
 */
export async function traderShortName(t: Trader): Promise<string> {
  try {
    const rows = await fxList('trmTrader', {});
    const txt = (r: Record<string, unknown>, k: string) => String(r[k] ?? '').trim();
    const byCode = rows.find(r => txt(r, 'ZTCODE') === t.code);
    const byName = rows.find(r => txt(r, 'ZNAME').toLowerCase() === t.name.trim().toLowerCase());
    return txt(byCode ?? byName ?? {}, 'ZTRADER') || t.name;
  } catch {
    return t.name;
  }
}

export interface AutoOutcome {
  /** The transactions SAP booked, Deal 1 first; one when Deal 2 failed. */
  booked: { companyCode: string; transaction: string; leg: 'Deal 1' | 'Deal 2' }[];
  /** Why Deal 2 (or Deal 1) was not booked, or why the application data did not save. */
  error: string;
  /** True when SAP booked a leg but its application data still has to be saved (the next release saves it). */
  pending: boolean;
}

/**
 * Books Deal 1 then Deal 2 in SAP with their application data (TXN_STATUS 01, master contract reference, trader).
 * Stops at the first refusal: a booked Deal 1 stays (nothing is reversed on the trader's behalf).
 */
export async function bookAutoDeal(mc: MasterContract, legs: AutoLeg[], blotterDate: string, trader: Trader): Promise<AutoOutcome> {
  const ctxDate = dateOf(blotterDate);
  const blotter: Blotter = {
    rows: [], contracts: [mc], deals: [], partners: [], counters: { ...INITIAL_COUNTERS },
    ctx: { date: ctxDate, group: '', trader: refTrader(trader.name) }, checked: [], locked: false
  };
  // No Deal ID yet: it is drawn at Release to MO. ('' keeps the reference from inventing a provisional one.)
  const preview = confirmAutoDeal(blotter, mc.mcNumber, legs, '');
  if (!preview) return { booked: [], error: 'The master contract or its legs could not be read.', pending: false };
  const ids = preview.blotter.deals[0]?.legs ?? [];
  const rows = ids.map(id => preview.blotter.rows.find(r => r.id === id)).filter((r): r is RefRow => Boolean(r));
  const booked: AutoOutcome['booked'] = [];
  let pending = false;
  for (const [i, r] of rows.entries()) {
    const leg = i === 0 ? 'Deal 1' : 'Deal 2';
    let b: Booked;
    try {
      b = await createBlotterDeal(r, ctxDate, { traderCode: trader.code });
    } catch (e) {
      return { booked, pending, error: `${leg} was not created: ${sapMessage(e)}${booked.length ? ` Deal 1 (${booked[0].transaction}) stays booked; reverse it if it is not wanted.` : ' Nothing was booked.'}` };
    }
    booked.push({ companyCode: b.companyCode, transaction: b.transaction, leg });
    if (b.appDataError) { pending = true; }
  }
  return { booked, pending, error: pending ? 'SAP booked the deals, but their application data did not save. Release to MO saves it.' : '' };
}

/** The reference row of a transaction read from SAP (the fields the Deal ID and the application data use). */
export function toRefRow(r: BlotterRow, leg: 'Deal 1' | 'Deal 2', traderName: string): RefRow {
  const a1 = Number(r.amount1) || 0, rate = Number(r.rate) || 0;
  const usdFirst = r.cur1 === 'USD';
  // Amount 2 is Amount 1 × the all-in rate for a USD-led pair, else Amount 1 ÷ it; only the USD side is used.
  const a2 = rate > 0 ? (usdFirst ? a1 * rate : a1 / rate) : 0;
  return {
    id: r.id, seq: 0, status: 'CREATED', draftLabel: '', transactionNumber: r.ref, group: '', trader: refTrader(traderName),
    tradeDate: r.tradeDate ? dateOf(r.tradeDate) : null, entity: r.company, companyCode: r.company, bp: r.bank, txnType: r.txnType,
    buySell: r.bs1 === 'Sell' ? 'S' : 'B', buySell2: r.bs1 === 'Sell' ? 'B' : 'S', curr1: r.cur1, amt1: a1, curr2: r.cur2, amt2: a2,
    spotRate: 0, swapPoints: 0, totalRate: rate, valueDate: r.valueDate ? dateOf(r.valueDate) : null, ndfDate: r.fixDate ? dateOf(r.fixDate) : null,
    ndfRef: r.fixRef, portfolio: 'TRADING', assignment: r.mode, profitCenter: '', businessArea: '', mcRef: r.mc, dealId: realDealId(r.dealId),
    dealType: leg, fxModel: '', notes: '', live: true, txnStatus: r.txnStatus
  };
}

/**
 * Deal 1 and Deal 2 of a pair. The master contract's FX model says which entity books Deal 1 (M032: OSIPL), so the leg
 * of that company is Deal 1; otherwise the earlier value date, then the lower number. Transaction numbers come from one
 * number range per company code, so the number alone never orders legs of two companies.
 */
export function orderLegs<T extends { ref: string; company?: string; valueDate?: string }>(rows: readonly T[], mc?: MasterContract): T[] {
  const d1From = mc ? modelOf(mc.fxModel)?.d1.from : undefined;
  const d1Company = d1From ? (entityOf(d1From)?.cocode ?? d1From) : '';
  const byModel = (r: T) => (d1Company && r.company === d1Company ? 0 : 1);
  return [...rows].sort((a, b) => (d1Company && rows.filter(r => r.company === d1Company).length === 1 ? byModel(a) - byModel(b) : 0)
    || (a.valueDate ?? '').localeCompare(b.valueDate ?? '') || (a.ref.length - b.ref.length) || a.ref.localeCompare(b.ref));
}

export interface ReleaseOutcome { dealId: string; created: boolean; errors: string[] }

/** A Deal ID drawn from the number range (10 digits); a provisional one ("TSF-12") is no Deal ID. */
export const realDealId = (id: string): string => (/^\d{10}$/.test(id.trim()) ? id.trim() : '');

/** Why two transactions cannot be released as a pair, or ''. */
export function pairReleaseProblem(rows: readonly BlotterRow[]): string {
  if (rows.length !== 2) return 'Select exactly two transactions.';
  if (rows.some(r => r.status !== 'Created')) return 'Only Created transactions can be released.';
  const refs = rows.map(r => toRefRow(r, 'Deal 1', ''));
  if (refs.some(r => !isInSap(r))) return 'Only transactions created in SAP can be released.';
  const ids = new Set(rows.map(r => realDealId(r.dealId)).filter(Boolean));
  if (ids.size > 1) return `The two transactions are on different Deal IDs (${[...ids].join(', ')}).`;
  if (ids.size === 1 && rows.some(r => !realDealId(r.dealId))) return `Only one of the two transactions is on Deal ID ${[...ids][0]}.`;
  return '';
}

/**
 * Releases a pair to MO. Without a Deal ID: draws one for the master contract (Deal 1 / Deal 2 = slots 1 / 2), moves the
 * contract to 04, then writes the Deal ID and TXN_STATUS 03 on both legs. With one already: only writes 03.
 */
/** `order`: the legs as Deal 1, Deal 2 when the person set them (Swap); else they are ordered by orderLegs. */
export async function releasePair(rows: readonly BlotterRow[], mc: MasterContract | undefined, blotterDate: string, trader: Trader, order?: readonly [BlotterRow, BlotterRow]): Promise<ReleaseOutcome> {
  const problem = pairReleaseProblem(rows);
  if (problem) throw new Error(problem);
  const [d1, d2] = order ?? orderLegs(rows, mc);
  const legs: [RefRow, RefRow] = [toRefRow(d1, 'Deal 1', trader.name), toRefRow(d2, 'Deal 2', trader.name)];
  const date = dateOf(blotterDate);
  let link: { dealId: string; mcRef: string; dealDesc?: string };
  let created = false;
  if (realDealId(d1.dealId)) {
    link = { dealId: realDealId(d1.dealId), mcRef: d1.mc || d2.mc };
  } else {
    if (!mc) throw new Error('Select the master contract for the new Deal ID.');
    const legsOnMc: [RefRow, RefRow] = [{ ...legs[0], mcRef: mc.mcNumber }, { ...legs[1], mcRef: mc.mcNumber }];
    const pair = await createPairDealId({ mc, legs: legsOnMc, traderName: await traderShortName(trader), traderCode: trader.code, year: date.getFullYear() });
    link = { dealId: pair.dealId, mcRef: mc.mcNumber, dealDesc: pair.dealDesc };
    created = true;
  }
  const outs: SaveOutcome[] = await releaseBlotterRows(legs.map(l => ({ ...l, dealId: link.dealId, mcRef: link.mcRef })), link, date, trader.code);
  return { dealId: link.dealId, created, errors: outs.filter(o => !o.ok).map(o => o.error ?? 'The application data did not save.') };
}

export { iso as isoOfDate, sapMessage };
