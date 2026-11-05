// The rules of MO: Execute Settlement for Deal ID (ZSGTSFR060 / ZSGTSF_RDEAL_TRD_INV), as the reference project
// (TSF - FX Application, features/mo-execute-settlement-deal-id) codes them. Pure: no data access, no state.
import type { Row } from '@/lib/grid/types';
import { amt } from '@/pages/fx/format';
import type { DiffInput, DiffRow, FxLeg, HeadsUp, InvLeg, Side, SetFxSide } from './data';

const text = (v: unknown): string => (v === undefined || v === null ? '' : String(v).trim());
const num = (v: unknown): number => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const round2 = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;

export const SETTLEMENT_INITIATED = '20';
export const EXECUTION_COMPLETED = '21';
/** EXE_C counts the completed trade legs against a fixed 6 (gv_count = 6). */
export const TRADE_LEGS = 6;
export const WAITING = 'WAITING FOR ACTION API';
export const FX_BANK_WAITING = `${WAITING}: the bank fields and Settlement Complete of an FX leg are written to the transaction's TrmFxApp record (ZSGTSFTR_APP_STR), which has no write API in this application yet. Nothing was saved.`;

/** The trade type ('T1') a BIL_ADJ invoice reference ('7000000023-T1', 'ZINV_REF+11(2)') carries. */
export const tradeTypeOfRef = (ref: string): string => {
  const at = text(ref).slice(11, 13);
  if (/^T\d$/.test(at)) return at;
  return /-(T\d)\b/.exec(text(ref))?.[1] ?? '';
};

// ------------------------------------------------------------------ FX legs

const isReversed = (r: Row) => r.reversed === 'X' || r.reversed === 'true';

/** One side of a leg's SET_FX mapping. */
function setFxSide(r: Row): SetFxSide {
  return { seq: text(r.seq), dssDeal: text(r.dssDeal), curr: text(r.curr), acc: text(r.acc), trfType: text(r.trfType), rbukrs: text(r.rbukrs), payId: text(r.payId), bankId: text(r.bankId), letCode: text(r.letCode), letName: text(r.letName), desc: text(r.setDesc) };
}

/**
 * The Deal ID's FX legs: the TSF deals report rows (reversed ones left out), the model's SET_FX laid over them (sequence, DSS deal,
 * buy / sell mapping) and the transaction's TrmFxApp record (settled flag, stored bank fields) where it could be read.
 */
export function buildFxLegs(deals: Row[], setFx: Row[], apps: Row[]): FxLeg[] {
  const out = deals.filter(r => !isReversed(r)).map((r): FxLeg => {
    const app = apps.find(a => a.companyCode === r.companyCode && a.financialTransaction === r.rfha);
    const type = text(r.dealType);
    const rows = setFx.filter(x => text(x.dMap) === type);
    const first = rows[0];
    const buyRow = rows.find(x => text(x.bs) === 'B');
    const sellRow = rows.find(x => text(x.bs) === 'S');
    const buy = buyRow && setFxSide(buyRow);
    const sell = sellRow && setFxSide(sellRow);
    const a = (f: string) => text(app?.[f]);
    const side = (co: string, payId: string, bankId: string, house: string, account: string): Side => ({ coCode: co, bankId: payId, payId: bankId, house, account });
    return {
      key: `${r.companyCode}-${r.rfha}`, seq: first ? text(first.seq) : a('ztsfDealSq'), coCode: text(r.companyCode), type, txn: text(r.rfha), txnType: text(r.transactionType),
      partner: text(r.partner), txnDate: text(r.tradeDate), valueDate: text(r.valueDate),
      bs1: text(r.bs1), cur1: text(r.curr1), amt1: Math.abs(num(r.amount1)), bs2: text(r.bs2), cur2: text(r.curr2), amt2: Math.abs(num(r.amount2)),
      spot: num(r.spotRate), rate: num(r.allInRate), typeDesc: [text(r.productType), text(r.transactionType)].filter(Boolean).join(' '), busArea: '', profit: '',
      txnStatus: text(r.txnStatus), txnStatusText: text(r.statusText), mc: text(r.mcRef), settled: a('ztsfExeCo') === 'X', doc1: '', doc2: '',
      transferType: buy?.trfType ?? '', bankType: buy?.acc ?? '',
      buy: side(a('ztsfRbukrs') || buy?.rbukrs || '', a('ztsfBpayID') || buy?.payId || '', a('ztsfRpayID') || buy?.bankId || '', a('ztsfBhbkID'), a('ztsfBhktID')),
      sell: side(a('ztsfPbukrs') || sell?.rbukrs || text(r.companyCode), a('ztsfSpayID') || sell?.payId || '', a('ztsfPpayID') || sell?.bankId || '', a('ztsfShbkID'), a('ztsfShktID')),
      remit: false, dssDeal: first ? text(first.dssDeal) : '', ...(buy ? { setFxBuy: buy } : {}), ...(sell ? { setFxSell: sell } : {})
    };
  });
  // A DSS leg takes the sequence of the leg it belongs to.
  for (const leg of out) {
    if (!leg.dssDeal) continue;
    const dss = out.find(l => l.type === leg.dssDeal);
    if (dss) dss.seq = leg.seq;
  }
  return out.sort((a, b) => (a.seq + a.type + a.txn < b.seq + b.type + b.txn ? -1 : 1));
}

// ------------------------------------------------------------------ trade invoice legs

/** The payment amount of a leg (INVOICE_SETTLEMENT_DATA): the invoice amount, converted at the mapped FX deal's all-in rate when the currencies differ. */
export function paymentAmount(p: { invAmt: number; curr: string; setCurr: string; dMap: string }, fx: readonly FxLeg[]): { amount: number; reason: string } {
  if (!p.setCurr || p.curr === p.setCurr) return { amount: round2(p.invAmt), reason: '' };
  const deal = p.dMap ? fx.find(d => d.type === p.dMap) : undefined;
  if (!deal) return { amount: 0, reason: `Payment amount in ${p.setCurr} cannot be worked out: ${p.dMap ? `the mapped FX deal ${p.dMap} does not exist yet` : 'the leg has no mapped FX deal (ZD_MAP)'}.` };
  if (!(deal.rate > 0)) return { amount: 0, reason: `Payment amount in ${p.setCurr} cannot be worked out: FX deal ${p.dMap} has no all-in rate.` };
  return { amount: round2(p.invAmt / deal.rate), reason: '' };
}

/**
 * The trade invoice grid: one row per SET_TYP leg of the model, amounts from BIL_ADJ, the stored settlement state of TRD_POS laid over it by
 * trade leg. Due date is the D1 transaction's value date, else BIL_ADJ's.
 */
export function buildInvoices(p: { dealId: string; setTyp: Row[]; billAdj: Row[]; positions: Row[]; posting: Row[]; fx: readonly FxLeg[] }): InvLeg[] {
  const d1Due = p.fx.find(f => f.type === 'D1')?.valueDate ?? '';
  const saved = new Map(p.positions.map(r => [text(r.tType), r]));
  const acc = new Map(p.posting.map(r => [text(r.fiType), r]));
  return [...p.setTyp]
    .sort((a, b) => num(a.seq) - num(b.seq) || text(a.tType).localeCompare(text(b.tType)))
    .map((t): InvLeg => {
      const leg = text(t.tType);
      const matches = p.billAdj.filter(b => tradeTypeOfRef(text(b.invRef)) === leg.slice(0, 2));
      const invAmt = round2(matches.reduce((sum, b) => sum + num(b.amt), 0));
      const pos = saved.get(leg);
      const post = acc.get(text(t.fiType));
      const curr = text(t.curr);
      const pay = paymentAmount({ invAmt, curr, setCurr: text(t.setCurr), dMap: text(t.dMap) }, p.fx);
      const receipt = leg.charAt(3) === 'S';
      const bank = matches.find(b => text(b.hbkid) || text(b.ptnrBkid));
      const desc = text(t.setDesc);
      return {
        seq: num(t.seq), leg, coCode: text(t.bukrs), seller: text(t.sell), buyer: text(t.buy), desc, docType: post ? text(post.docType) : '',
        ref: text(matches[0]?.invRef) || (post ? text(post.xblnr1) : ''), due: d1Due || text(matches[0]?.dueDate),
        invAmt, invCur: curr, payAmt: pay.amount, payCur: text(t.setCurr) || curr, payReason: pay.reason, fxDeal: text(t.dMap), transferType: text(t.trfType),
        fiDoc: pos ? text(pos.belnr) : '', settled: pos ? text(pos.exeCo) === 'X' : false,
        senderBank: pos && !receipt ? text(pos.hbkid) : '', senderAcc: pos && !receipt ? text(pos.hktid) : '',
        receiverBank: (pos ? text(pos.recHbkid) : '') || text(bank?.hbkid), receiverAcc: (pos ? text(pos.recHktid) : '') || text(bank?.hktid),
        partnerId: text(bank?.bp), docMsg: `${desc} - ${leg} settlement for Deal ID ${p.dealId}`,
        dssDeal: text(t.dssDeal), fiType: text(t.fiType), postDesc: text(t.postDesc), setType: text(t.setType), setCheck: text(t.setCheck) === 'X', postCheck: text(t.postCheck) === 'X',
        premAdj: text(t.premAdj), postDate: pos ? text(pos.pDate) : '', stored: !!pos
      };
    });
}

const recPayText = (l: InvLeg) => (l.leg.charAt(3) === 'P' ? 'Payment' : l.leg.charAt(3) === 'S' ? 'Receipt' : '');

/** The TRD_POS fields Initiate Settlement stores for a leg (save_data): the whole row, so completion flag, FI document and message start blank. */
export function positionFields(dealId: string, l: InvLeg, idx: number, today: string): Record<string, string> {
  const due = l.due || today;
  return {
    dealId, seq: String(l.seq || idx + 1), bukrs: l.coCode, tType: l.leg, rp: recPayText(l), sell: l.seller, buy: l.buyer, amt: String(l.invAmt), curr: l.invCur,
    dueDate: due, pDate: l.postDate || due, dMap: l.fxDeal, trfType: l.transferType, setType: l.setType, setDesc: l.desc, setCheck: l.setCheck ? 'X' : '',
    postCheck: l.postCheck ? 'X' : '', fiType: l.fiType, postDesc: l.postDesc, payAmt: String(l.payAmt), setCurr: l.payCur,
    hbkid: '', hktid: '', belnr: '', recHbkid: '', recHktid: '', docType: l.docType, msg: '', exeCo: ''
  };
}

// ------------------------------------------------------------------ the sequence rule

export const previousNotSettled = (seq: number) => `Sequence ${seq} is not settled yet: settle the legs in sequence order (E052).`;

/**
 * set_complete / set_complete_txn: sequence 1 may always be settled; a later one only once the trade leg at sequence - 1 is settled and, if an FX leg
 * sits at that sequence, that FX leg too. Unsequenced legs wait for the ordered ones. '' when the leg may be settled, else the refusal.
 */
export function sequenceRefusal(seq: string | number, inv: readonly InvLeg[], fx: readonly FxLeg[], kind: 'trade' | 'fx'): string {
  const s = Number(seq);
  if (!text(seq) || s === 0) {
    if (kind === 'trade') return 'The trade invoice leg has no settlement sequence. Correct its settlement mapping before settling.';
    const openInv = inv.filter(r => !r.settled);
    if (openInv.length) return `Settle the trade invoice legs first: ${openInv.map(r => `${r.seq} ${r.leg}`).join(', ')} (E052).`;
    const openFx = fx.filter(r => Number(r.seq) > 0 && !r.settled);
    if (openFx.length) return `Settle the sequenced FX legs first: ${openFx.map(r => `${r.seq} ${r.type} ${r.txn}`).join(', ')} (E052).`;
    return '';
  }
  if (!Number.isInteger(s) || s < 1) return `Invalid settlement sequence '${seq}'. Correct its settlement mapping before settling.`;
  const prev = s - 1;
  if (prev === 0) return '';
  const i = inv.find(r => r.seq === prev);
  const f = fx.find(r => Number(r.seq) === prev);
  if (!i) return previousNotSettled(prev);
  if (kind === 'fx') return f && !f.settled ? previousNotSettled(prev) : i.settled ? '' : previousNotSettled(prev);
  if (!i.settled) return previousNotSettled(prev);
  if (f && !f.settled) return `The FX deal ${f.type} ${f.txn} of sequence ${prev} is not settled yet (E068).`;
  return '';
}

/** I034: why a leg action is refused before status 20. */
export function notAt20(id: string, status: string): string {
  const s = parseInt(status, 10);
  const at = `Deal ID ${id} is at status ${status || '(none)'}`;
  return s >= 5
    ? `${at}. Click Initiate Settlement first: the legs can only be settled once the Deal ID is at 20 - Settlement Initiated.`
    : `${at}, so settlement cannot start yet. Initiate Settlement is offered from status 05 to 19: finish invoicing first.`;
}

/** EXE_C: '' when the Deal ID may move to 21, else why not (I064 six trade legs, I065 the FX legs they map to). */
export function executionRefusal(fx: readonly FxLeg[], inv: readonly InvLeg[], noInvoice: boolean): string {
  const open = (types: readonly string[]) => fx.filter(f => types.includes(f.type) && !f.settled).map(f => `${f.type} ${f.txn}`);
  if (noInvoice) {
    const legs = fx.filter(f => (f.setFxBuy || f.setFxSell) && !f.settled).map(f => `${f.type} ${f.txn}`);
    return legs.length ? `These FX legs are not settled yet: ${legs.join(', ')} (I065).` : '';
  }
  const done = inv.filter(r => r.settled).length;
  if (done !== TRADE_LEGS) return `${done} of ${TRADE_LEGS} trade invoice legs are settled (I064). Not settled yet: ${inv.filter(r => !r.settled).map(r => r.leg).join(', ') || '-'}.`;
  const mapped = inv.flatMap(r => [r.fxDeal, r.dssDeal].filter(Boolean));
  const legs = [...new Set(open(mapped))];
  return legs.length ? `These FX legs are not settled yet: ${legs.join(', ')} (I065).` : '';
}

// ------------------------------------------------------------------ heads up

const SPOTS = new Set(['DS1', 'DS2', 'DSS1', 'DSS2']);
const dealAmountIn = (leg: FxLeg | undefined, curr: string): number => (leg ? Math.abs(curr === leg.cur1 ? leg.amt1 : leg.amt2) : 0);

/** PROCESS_DATA: invoices linked to the FX legs by position; the final invoice amount against the deal amount, and the action FX for the model's trade. */
export function computeHeadsup(p: { model: string; fx: readonly FxLeg[]; rules: Row[]; invRef: Row[]; billAdj: Row[]; setTyp: Row[] }): { rows: HeadsUp[]; notice: string } {
  const base = p.fx.filter(r => !SPOTS.has(r.type));
  const rule = base.length <= 2 ? p.rules[0] : p.rules.find(r => num(r.d1PutCall) === 1);
  if (!rule) return { rows: [], notice: `The Headsup invoice-link rules for model ${p.model} could not be found.` };
  if (text(rule.subType) === 'FX2') return { rows: [], notice: 'Heads Up for option models requires option transaction amounts and expiry dates. ZSGTSFCDS_OPTION is not exposed by an API yet.' };
  if (text(rule.subType) !== 'FX1') return { rows: [], notice: `Model ${p.model} has no supported Headsup subtype in RULE_BT.` };
  const templates = p.setTyp.filter(r => text(r.dssDeal) !== '');
  const rows: HeadsUp[] = [];
  for (const [index, invoice] of p.invRef.entries()) {
    const trade = text(invoice.ttype);
    const cur = text(invoice.trdCurr);
    const template = templates.find(r => text(r.tType).slice(0, 2) === trade);
    if (!template) continue;
    const count = String(index + 1);
    const linked = (slot: '1' | '2') => [`d${slot}InvLink`, `d${slot}InvLink2`].some(k => text(rule[k]).slice(1, 2) === count);
    const type = linked('1') ? 'D1' : linked('2') ? (p.model === 'M025' ? 'D3' : 'D2') : '';
    const leg = type ? p.fx.find(r => r.type === type) : undefined;
    const fxAmt = dealAmountIn(leg, cur);
    const total = p.billAdj.filter(b => tradeTypeOfRef(text(b.invRef)) === trade).reduce((sum, b) => sum + num(cur === 'USD' ? b.amtUsd : b.amt), 0);
    const diff = round2(Math.abs(total - fxAmt));
    const final = round2(Math.abs(total));
    const seller = text(template.sell), buyer = text(template.buy);
    let action = '';
    if (text(template.headFx) === 'X') {
      const amount = [seller, buyer].some(e => e === 'OIL' || e === 'OGA') ? diff : [seller, buyer].includes('DMCC') ? final : null;
      if (amount !== null) action = [text(template.actfx), cur, amt(amount)].filter(Boolean).join(' ');
    }
    rows.push({ entity: `${seller}-${buyer}`, trade, fxAmt, invAmt: final, cur, action, diff });
  }
  return { rows, notice: '' };
}

// ------------------------------------------------------------------ FX-invoice difference (screen 9006, DIFF_NEW)

const SPOT_TYPES = new Set(['DS1', 'DS2', 'DSS1', 'DSS2', '']);
const USD = 'USD';
const digitOf = (link: string): string => link.slice(1, 2);

/** PROCESS_DATA_NEW: one row per planned invoice: planned and final amounts, the deal amount it maps to and the differences. */
export function computeDifferences(p: DiffInput): DiffRow[] {
  const lines = p.fx.filter(f => !SPOT_TYPES.has(f.type)).length;
  const rule = lines > 2 ? p.rules.find(r => num(r.d1PutCall) === 1) : (p.rules.find(r => text(r.d1InvLink) !== '') ?? p.rules[0]);
  const link = (k: string) => (rule ? text(rule[k]) : '');
  const top = (type: string) => p.fx.find(f => f.type === type);
  const set = (sign: string) => p.setSpt.find(r => text(r.sign) === sign);
  const spt = p.tsfPay[0];
  const planned = [...p.invRef].sort((a, b) => (text(a.ttype) < text(b.ttype) ? -1 : text(a.ttype) > text(b.ttype) ? 1 : 0));
  const out: DiffRow[] = planned.map((r, i) => {
    const cur = text(r.trdCurr);
    const row: DiffRow = { trade: text(r.ttype), cur, planned: cur === USD ? num(r.amt) : num(r.invAmt), finalInv: 0, dealType: '', dealAmt: 0, spotCo: '', bs: '', saved: false, diff: 0, deal3Type: '', deal3Amt: 0, diff3: 0 };
    const digit = String(i + 1);
    if (digitOf(link('d1InvLink')) === digit || digitOf(link('d1InvLink2')) === digit) { row.dealType = 'D1'; row.dealAmt = dealAmountIn(top('D1'), cur); }
    else if (digitOf(link('d2InvLink')) === digit || digitOf(link('d2InvLink2')) === digit) { row.dealType = 'D2'; row.dealAmt = dealAmountIn(top('D2'), cur); }
    return row;
  });
  for (const row of out) {
    row.finalInv = p.billAdj.filter(b => tradeTypeOfRef(text(b.invRef)) === row.trade).reduce((sum, b) => sum + num(row.cur === USD ? b.amtUsd : b.amt), 0);
    const planDiff = round2(row.planned - row.finalInv);
    row.diff = round2(row.dealAmt - row.finalInv);
    const sell = p.inv.find(l => l.leg.charAt(3) === 'S' && l.leg.slice(0, 2) === row.trade);
    if (sell) {
      row.deal3Type = sell.fxDeal;
      const t = top(row.deal3Type);
      if (t) { row.deal3Amt = dealAmountIn(t, sell.invCur); row.diff3 = round2(row.deal3Amt - row.finalInv); }
    }
    const setRow = set(planDiff < 0 ? '-' : '+');
    if (setRow) {
      const slot = row.dealType.slice(1, 2);
      if (slot === '1' || slot === '2') { row.spotCo = text(setRow[`d${slot}Bukrs`]); row.bs = text(setRow[`d${slot}Bcurr`]) === row.cur ? 'Buy' : 'Sell'; }
    }
    if (spt) {
      const slot = row.deal3Type.slice(2, 3);
      if (slot === '1' || slot === '2') { row.spotCo = text(spt[`d${slot}Bukrs`]); row.bs = text(spt[`d${slot}Bcurr`]) === row.cur ? 'Buy' : 'Sell'; }
    }
    row.saved = p.existing.some(e => text(e.dealType) === row.dealType) || p.existing.some(e => text(e.dealType) === row.deal3Type);
  }
  return out;
}

/** An IN_SPOT row, in the module's fields, amounts with the two decimals the table stores. */
export type InSpotWrite = Record<'modId' | 'dealId' | 'dealType' | 'dssType' | 'bukrs' | 'rfha' | 'tType' | 'fAmt' | 'fxAmt' | 'curr' | 'dAmt' | 'sbukrs' | 'bs', string>;
const dec2 = (v: number): string => (Math.round((v + Number.EPSILON) * 100) / 100).toFixed(2);
const amounts = (d: DiffRow): { fx: number; diff: number } => ({ fx: d.deal3Amt !== 0 ? d.deal3Amt : d.dealAmt, diff: d.diff3 !== 0 ? d.diff3 : d.diff });
const FORWARD_TXN_TYPE = '619';

/**
 * SAVE_SPOT_DATA_NEW: first the invoice legs mapped to a DSS deal, then every non-forward FX leg; a row whose deal type is already saved is skipped, a
 * row with neither a deal type nor a DSS type is dropped, and a row repeated for the same key keeps the last one (MODIFY).
 */
export function rowsToSave(p: DiffInput, diffs: readonly DiffRow[]): InSpotWrite[] {
  const rows: InSpotWrite[] = [];
  let len = 0;
  const make = (dealType: string, dssType: string, bukrs: string, rfha: string, d: DiffRow): InSpotWrite => {
    const a = amounts(d);
    return { modId: p.model, dealId: p.dealId, dealType, dssType, bukrs, rfha, tType: d.trade, fAmt: dec2(d.finalInv), fxAmt: dec2(a.fx), curr: d.cur, dAmt: dec2(a.diff), sbukrs: d.spotCo, bs: d.bs };
  };
  for (const inv of p.inv) {
    if (inv.dssDeal.slice(0, 3) !== 'DSS') continue;
    const map = inv.fxDeal;
    const top = p.fx.find(f => f.type === map);
    if (top) len = map.length;
    const d = len === 2 ? diffs.find(x => x.dealType === map && x.cur === inv.invCur) : diffs.find(x => x.deal3Type === map && x.cur === inv.invCur);
    if (!d || d.saved) continue;
    rows.push(make(map, inv.dssDeal, top?.coCode ?? '', top?.txn ?? '', d));
  }
  for (const top of p.fx) {
    if (top.txnType.slice(0, 3) === FORWARD_TXN_TYPE) continue;
    len = top.type.length;
    const d = len === 2 ? diffs.filter(x => x.deal3Type !== '').find(x => x.dealType === top.type) : diffs.find(x => x.deal3Type === top.type);
    if (!d || d.saved) continue;
    rows.push(make(top.type, '', '', '', d));
  }
  const byKey = new Map<string, InSpotWrite>();
  for (const r of rows) {
    if (r.dealType === '' && r.dssType === '') continue;
    byKey.set(`${r.modId}|${r.dealId}|${r.dealType}|${r.dssType}`, r);
  }
  return [...byKey.values()];
}

export const SAVED_MESSAGE = 'Details Saved Successfully..';
export const ALREADY_SAVED_MESSAGE = 'Data already saved..';

/** P&L on the D2 leg: (D2 all-in rate - D1 all-in rate) x D1 Amount 1. */
export function plAmount(fx: readonly FxLeg[], leg: FxLeg): number | null {
  const d1 = fx.find(l => l.type === 'D1');
  return leg.type === 'D2' && d1 ? (leg.rate - d1.rate) * d1.amt1 : null;
}
