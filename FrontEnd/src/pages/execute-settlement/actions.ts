// The settlement actions of MO: Execute Settlement for Deal ID, as ZSGTSF_RDEAL_TRD_INV codes them. MO settles; it never posts (the accounting
// entries are BO's, ZSGTSFR081). Every write goes through the data client; the screen's tests run them against fake ports.
//
//   Initiate Settlement   one TRD_POS row per trade invoice leg (the whole row), then the Deal ID status 20
//   Update (invoice)      Sender / Receiver house bank and account on the TRD_POS rows of the same trade type (both its S and P legs)
//   Settlement Complete   the sequence rule, the bank data, then TRD_POS ZEXE_CO = 'X'
//   Execution Complete    the Deal ID status 21, once six trade legs and every FX leg they map to are settled
//   Save Difference       IN_SPOT rows of the FX-invoice difference (MODIFY: create the row, or update the one with the same key)
// The FX legs' bank fields and Settlement Complete (TrmFxApp) are not written here: see FX_BANK_WAITING.
import { moduleChange, moduleQuery, objectWrite } from '@/lib/client/data';
import type { Row } from '@/lib/grid/types';
import type { Deal, InvLeg } from './data';
import { SETTLEMENT_DATA } from './live';
import {
  ALREADY_SAVED_MESSAGE, EXECUTION_COMPLETED, SAVED_MESSAGE, SETTLEMENT_INITIATED, computeDifferences, executionRefusal, notAt20, positionFields, rowsToSave, sequenceRefusal,
  type InSpotWrite
} from './logic';

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

/** The writes the actions need; `livePorts` calls the data client. */
export interface ActionPorts {
  /** Creates or updates TRD_POS rows of the Deal ID by their sequence (the fields are the module's, `dealId` and `seq` included). */
  writePositions: (dealId: string, rows: Record<string, string>[]) => Promise<void>;
  /** Changes fields of the Deal ID record through the tsf-deal-id module (the stored record is sent whole, with the changes). */
  updateDeal: (deal: Deal, changes: Record<string, string>) => Promise<void>;
  /** The IN_SPOT rows of the Deal ID, as stored now. */
  readInSpot: (dealId: string) => Promise<Row[]>;
  writeInSpot: (rows: InSpotWrite[], existing: Row[]) => Promise<void>;
}

const eq = (field: string, value: string) => [{ field, op: 'eq' as const, values: [value] }];
const same = (a: Row, b: Record<string, string>, keys: string[]) => keys.every(k => (a[k] ?? '') === (b[k] ?? ''));

/** Each row is created, or updated when a row with its key is stored (one change per kind; a failure says what was saved). */
async function upsert(table: string, keys: string[], stored: Row[], rows: Record<string, string>[]): Promise<void> {
  const creates: Record<string, string>[] = [];
  const updates: Record<string, string>[] = [];
  for (const r of rows) {
    const found = stored.find(s => same(s, r, keys));
    if (found) updates.push({ ...found, ...r }); else creates.push(r);
  }
  if (creates.length) await moduleChange(SETTLEMENT_DATA, table, 'create', creates);
  if (updates.length) await moduleChange(SETTLEMENT_DATA, table, 'update', updates);
}

export const livePorts: ActionPorts = {
  writePositions: async (dealId, rows) => {
    const stored = (await moduleQuery(SETTLEMENT_DATA, 'positions', { page: 1, pageSize: 500, filters: eq('dealId', dealId) })).rows;
    await upsert('positions', ['dealId', 'seq'], stored, rows);
  },
  updateDeal: async (deal, changes) => {
    await objectWrite('tsf-deal-id', 'update', { key: { dealId: deal.id, dealType: deal.dealType, subType: deal.subType }, etag: deal.etag, header: { ...deal.record, ...changes } });
  },
  readInSpot: async dealId => (await moduleQuery(SETTLEMENT_DATA, 'inSpot', { page: 1, pageSize: 500, filters: eq('dealId', dealId) })).rows,
  writeInSpot: (rows, existing) => upsert('inSpot', ['modId', 'dealId', 'dealType', 'dssType'], existing, rows)
};

const failed = (what: string, error: unknown): ActionResult => ({ ok: false, error: `${what} failed: ${error instanceof Error ? error.message : String(error)}` });
const stat = (deal: Deal) => parseInt(deal.status, 10) || 0;
const isoToday = () => new Date().toISOString().slice(0, 10);

/** Initiate Settlement (offered 05..19): every trade leg's TRD_POS row, then status 20 (S030). */
export async function initiateSettlement(deal: Deal, ports: ActionPorts = livePorts, today = isoToday()): Promise<ActionResult> {
  if (!(stat(deal) >= 5 && stat(deal) <= 19)) return { ok: false, error: `Settlement can only be initiated from status 05 to 19; Deal ID ${deal.id} is at ${deal.status}.` };
  try {
    await ports.writePositions(deal.id, deal.inv.map((l, i) => positionFields(deal.id, l, i, today)));
  } catch (error) { return failed('Writing the settlement legs (ZSGTSFTR_TRD_POS)', error); }
  try {
    await ports.updateDeal(deal, { status: SETTLEMENT_INITIATED });
  } catch (error) { return failed(`The legs were written, but moving Deal ID ${deal.id} to ${SETTLEMENT_INITIATED}`, error); }
  return { ok: true, message: `Settlement initiated for Deal ID ${deal.id}: status 20 - Settlement Initiated.` };
}

/**
 * save_bank_data: Sender / Receiver house bank and account on every leg of the same trade type (T1-S and T1-P together). The leg's configuration rides
 * along, so a row created here still carries its descriptions and amounts; a stored posting date is left alone.
 */
function bankRows(deal: Deal, leg: InvLeg, edited: InvLeg, today: string, extra: Record<string, string> = {}): Record<string, string>[] {
  const banks = {
    hbkid: edited.senderBank.trim().toUpperCase().slice(0, 5), hktid: edited.senderAcc.trim().toUpperCase().slice(0, 5),
    recHbkid: edited.receiverBank.trim().toUpperCase().slice(0, 5), recHktid: edited.receiverAcc.trim().toUpperCase().slice(0, 5)
  };
  const skip = new Set(['exeCo', 'belnr', 'msg', 'hbkid', 'hktid', 'recHbkid', 'recHktid']);
  return deal.inv.flatMap((l, i) => {
    if (l.leg.slice(0, 2) !== leg.leg.slice(0, 2)) return [];
    const config = Object.fromEntries(Object.entries(positionFields(deal.id, l, i, today)).filter(([k]) => !skip.has(k)));
    return [{ ...config, ...banks, ...(l.leg === leg.leg ? extra : {}) }];
  });
}

/** Update (UPD_DATA): allowed at 20 and later, or at 05 (I034 otherwise). Nothing is completed. */
export async function updateInvoiceLeg(deal: Deal, leg: InvLeg, edited: InvLeg, ports: ActionPorts = livePorts, today = isoToday()): Promise<ActionResult> {
  if (!(stat(deal) >= 20 || stat(deal) === 5)) return { ok: false, error: notAt20(deal.id, deal.status) };
  try {
    await ports.writePositions(deal.id, bankRows(deal, leg, edited, today));
    return { ok: true, message: `Bank data of ${leg.leg.slice(0, 2)} updated (S033).` };
  } catch (error) { return failed(`Updating leg ${leg.leg}`, error); }
}

/** Settlement Complete (SET_EXE): status 20+, the sequence rule, the bank data, then ZEXE_CO = 'X' (S051). */
export async function completeInvoiceLeg(deal: Deal, leg: InvLeg, edited: InvLeg, ports: ActionPorts = livePorts, today = isoToday()): Promise<ActionResult> {
  if (stat(deal) < 20) return { ok: false, error: notAt20(deal.id, deal.status) };
  if (leg.settled) return { ok: false, error: `Sequence ${leg.seq} (${leg.leg}) is already settled.` };
  const refusal = sequenceRefusal(leg.seq, deal.inv, deal.fx, 'trade');
  if (refusal) return { ok: false, error: refusal };
  try {
    await ports.writePositions(deal.id, bankRows(deal, leg, edited, today, { exeCo: 'X' }));
    return { ok: true, message: `Sequence ${leg.seq} (${leg.leg}) settled (S051). Its accounting entry is posted on BO (ZSGTSFR081).` };
  } catch (error) { return failed(`Settling leg ${leg.leg}`, error); }
}

/** Amend End Date: the Deal ID's revised end date (ZREV_DEDATE), as an ISO date. */
export async function amendEndDate(deal: Deal, iso: string, ports: ActionPorts = livePorts): Promise<ActionResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return { ok: false, error: 'Enter a date first.' };
  try {
    await ports.updateDeal(deal, { revisedEndDate: iso });
    return { ok: true, message: `Deal end date amended to ${iso}.` };
  } catch (error) { return failed(`Amending the end date of Deal ID ${deal.id}`, error); }
}

/** Execution Complete (EXE_C): 20 -> 21 once executionRefusal has nothing to say. */
export async function completeExecution(deal: Deal, ports: ActionPorts = livePorts): Promise<ActionResult> {
  if (deal.status !== SETTLEMENT_INITIATED) return { ok: false, error: notAt20(deal.id, deal.status) };
  const refusal = executionRefusal(deal.fx, deal.inv, deal.noInvoice);
  if (refusal) return { ok: false, error: refusal };
  try {
    await ports.updateDeal(deal, { status: EXECUTION_COMPLETED });
    return { ok: true, message: `Deal ID ${deal.id} is now 21 - Settlement Completed - Execution.` };
  } catch (error) { return failed(`Moving Deal ID ${deal.id} to ${EXECUTION_COMPLETED}`, error); }
}

/**
 * Save Difference (SAVE_SPOT_DATA_NEW): re-reads the Deal ID's IN_SPOT rows first, so a row saved since the screen opened is not written twice. Nothing to
 * save is the program's information message, not an error.
 */
export async function saveDifference(deal: Deal, ports: ActionPorts = livePorts): Promise<ActionResult> {
  try {
    const existing = await ports.readInSpot(deal.id);
    const input = { ...deal.diffInput, existing };
    const rows = rowsToSave(input, computeDifferences(input));
    if (!rows.length) return { ok: true, message: ALREADY_SAVED_MESSAGE };
    await ports.writeInSpot(rows, existing);
    return { ok: true, message: SAVED_MESSAGE };
  } catch (error) { return failed('Saving the invoice difference (ZSGTSFTR_IN_SPOT)', error); }
}
