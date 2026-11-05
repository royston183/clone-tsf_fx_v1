// The MO actions of TSF MO Deal Confirmation. Match & Release settles the transaction in SAP (bound action Settle of
// FxTransaction, ZFS_SB_TRMFX_O4_API) and only then moves the workflow record (TrmFxApp, ZFS_SB_TRMFXAPP_O4_API) to status
// 07 (59 for deal type 00) with the MO remark and the internal reference. Correction Required changes TrmFxApp alone
// (status 04 and the MO remark); SAP's settlement is not called. The two services are separate, so the second step can fail
// after the first succeeded: that is reported, and a repeat does not settle again (the transaction is already settled).
// Every write re-reads the record first, so a stale row is never processed twice, and stops at the first failure.
import { objectAction, objectRead, objectWrite } from '@/lib/client/data';
import type { StoredObject } from '@core/server/backend';
import { SETTLED_CATEGORY } from '@/modules/fx-transaction/definition';
import type { ConfDeal } from './data';

export const EXTERNAL_REF_MAX = 16;
export const INTERNAL_REF_MAX = 15;
export const MO_REMARK_MAX = 80;
/** Statuses MO can act on: FO -> MO Unmatched and FO Corrected (04 is with FO and comes back as 06). */
export const ACTIONABLE = ['03', '06'];
export const CORRECTION_REMARK_REQUIRED = 'Please fill the MO Remarks and Update';
const EXTERNAL_REF_UNSUPPORTED = 'External Ref cannot be saved by the connected SAP service yet. SAP must enable ExternalReference before confirming with this field filled.';

/** The data client's calls this flow makes; the real ones by default, a fake SAP in tests. */
export interface FxIo {
  read(module: string, key: Record<string, string>): Promise<StoredObject>;
  update(module: string, body: Record<string, unknown>): Promise<unknown>;
  action(module: string, action: string, body: Record<string, unknown>): Promise<unknown>;
}
export const liveIo: FxIo = {
  read: (module, key) => objectRead(module, key),
  update: (module, body) => objectWrite(module, 'update', body),
  action: (module, action, body) => objectAction(module, action, body)
};

export type Target = Pick<ConfDeal, 'dealId' | 'companyCode' | 'transaction'>;
export interface MoInput { extRef: string; intRef: string; moRemark: string }
export interface MoFailure { dealId: string; stage: 'validate' | 'settle' | 'workflow'; reason: string; settled?: boolean }
export interface MoDone { key: string; status: string; moRemark: string; intRef: string }
export interface MoBatch { done: MoDone[]; failed?: MoFailure }

const keyOf = (d: Target) => ({ companyCode: d.companyCode, financialTransaction: d.transaction });
const rowKey = (d: Target) => `${d.companyCode}-${d.transaction}`;
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const status404 = (e: unknown) => typeof e === 'object' && e !== null && (e as { status?: number }).status === 404;

/** Why MO cannot act on a deal in this status; '' when it can. */
export function blockReason(status: string): string {
  if (ACTIONABLE.includes(status)) return '';
  if (status === '04') return 'it is already with FO for correction and comes back to MO once FO has corrected it';
  if (status === '07') return 'it has already been matched and released';
  if (status === '59') return 'it is an offset transaction and is already complete';
  return `its status is ${status || 'not set'}, which MO does not process here`;
}
/** 59 for an FX cancellation deal (deal type 00), 07 otherwise. */
export const statusAfterRelease = (dealType: string): string => (dealType === '00' ? '59' : '07');

/** The deal's stored workflow record, read again now; a failure when it is missing or MO cannot act on its status. */
async function current(io: FxIo, d: Target): Promise<{ record: StoredObject } | { failure: MoFailure }> {
  let record: StoredObject;
  try {
    record = await io.read('trm-fx-app', keyOf(d));
  } catch (e) {
    return { failure: { dealId: d.dealId, stage: 'validate', reason: status404(e) ? 'This transaction has no application-data record, so MO cannot process it.' : `The workflow data could not be read: ${msg(e)}` } };
  }
  const why = blockReason(String(record.header.txnStatus ?? '').trim());
  if (why) return { failure: { dealId: d.dealId, stage: 'validate', reason: `Deal ${d.dealId || d.transaction} cannot be processed: ${why}. Refresh to see its current status.` } };
  return { record };
}

/** Saves a status change on the record the caller just read (its ETag guards against a change since). */
async function save(io: FxIo, d: Target, record: StoredObject, changes: Record<string, string>): Promise<void> {
  await io.update('trm-fx-app', { key: keyOf(d), etag: record.header.__etag, header: { ...record.header, ...changes } });
}

/** Match & Release of one deal: validate, settle in SAP (unless already settled), then save the status, remark and reference. */
export async function matchAndReleaseDeal(d: Target, input: MoInput, io: FxIo = liveIo): Promise<{ ok: true; done: MoDone } | { ok: false; failure: MoFailure }> {
  const fail = (failure: MoFailure) => ({ ok: false as const, failure });
  const extRef = input.extRef.trim(), intRef = input.intRef.trim(), moRemark = input.moRemark.trim();
  if (extRef.length > EXTERNAL_REF_MAX || intRef.length > INTERNAL_REF_MAX) {
    return fail({ dealId: d.dealId, stage: 'validate', reason: `External Ref must be at most ${EXTERNAL_REF_MAX} characters and Internal Ref at most ${INTERNAL_REF_MAX} characters.` });
  }
  if (moRemark.length > MO_REMARK_MAX) return fail({ dealId: d.dealId, stage: 'validate', reason: `MO Remarks must be at most ${MO_REMARK_MAX} characters.` });
  // FxTransaction has no External Reference property: refuse before settling, as the reference does.
  if (extRef) return fail({ dealId: d.dealId, stage: 'validate', reason: EXTERNAL_REF_UNSUPPORTED });
  const checked = await current(io, d);
  if ('failure' in checked) return fail(checked.failure);

  let settled = false;
  try {
    const tx = await io.read('fx-transaction', keyOf(d));
    if (String(tx.header.activityCategory ?? '') !== SETTLED_CATEGORY) {
      await io.action('fx-transaction', 'settle', { key: keyOf(d), etag: tx.header.__etag });
      settled = true;
    }
  } catch (e) {
    return fail({ dealId: d.dealId, stage: 'settle', reason: msg(e) });
  }

  const status = statusAfterRelease(String(checked.record.header.ztsfDealType ?? '').trim());
  try {
    // Read again: the settlement may have touched the record, and its ETag must be the current one.
    const fresh = await io.read('trm-fx-app', keyOf(d));
    await save(io, d, fresh, { txnStatus: status, ...(moRemark ? { ndfMoRem: moRemark } : {}), ...(intRef ? { zolamDealNo: intRef } : {}) });
  } catch (e) {
    return fail({
      dealId: d.dealId, stage: 'workflow', settled: settled || undefined,
      reason: `SAP transaction ${d.transaction} was settled successfully, but its MO workflow data could not be updated (${msg(e)}). Match & Release it again to save; the transaction is not settled again.`
    });
  }
  return { ok: true, done: { key: rowKey(d), status, moRemark, intRef } };
}

/** The deals one after the other; the run stops at the first failure and what was done before it stays done. */
export async function matchAndReleaseDeals(deals: readonly Target[], input: MoInput, io: FxIo = liveIo): Promise<MoBatch> {
  const done: MoDone[] = [];
  for (const d of deals) {
    const r = await matchAndReleaseDeal(d, input, io);
    if (!r.ok) return { done, failed: r.failure };
    done.push(r.done);
  }
  return { done };
}

/** Correction Required: status 04 and the MO remark in the workflow record alone; SAP's settlement is not called. */
export async function requestCorrectionDeals(deals: readonly Target[], remark: string, io: FxIo = liveIo): Promise<MoBatch> {
  const text = remark.trim();
  if (!text) return { done: [], failed: { dealId: deals[0]?.dealId ?? '', stage: 'validate', reason: CORRECTION_REMARK_REQUIRED } };
  if (text.length > MO_REMARK_MAX) return { done: [], failed: { dealId: deals[0]?.dealId ?? '', stage: 'validate', reason: `MO Remarks must be at most ${MO_REMARK_MAX} characters.` } };
  const done: MoDone[] = [];
  for (const d of deals) {
    const checked = await current(io, d);
    if ('failure' in checked) return { done, failed: checked.failure };
    try {
      await save(io, d, checked.record, { txnStatus: '04', ndfMoRem: text });
    } catch (e) {
      return { done, failed: { dealId: d.dealId, stage: 'workflow', reason: `The correction request could not be saved: ${msg(e)}` } };
    }
    done.push({ key: rowKey(d), status: '04', moRemark: text, intRef: '' });
  }
  return { done };
}
