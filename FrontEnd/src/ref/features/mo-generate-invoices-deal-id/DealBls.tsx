// Invoice Finalisation: the BLs assigned to the Deal ID (in Propose Tradeflow, BillOfLading.DealId in SAP) shown on the
// screen, and the invoice review that comes before the invoice is generated: 1 Review BLs, 2 Check amounts, 3 Confirm.
// Read only: the confirmation itself is the screen's existing one (compliance, then the save).
import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ChevronLeft, ChevronRight, FileCheck2 } from 'lucide-react'
import { DataTable } from '@/components/table/DataTable'
import { TrafficLightTag } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { onSampleData } from '@/lib/client/data'
import { formatAmount, formatCompact, formatDate } from '@/lib/fields/parse'
import { str } from '@/lib/grid/grid'
import type { Row } from '@/lib/grid/types'
import { fmtQty } from '@/pages/manage-tradeflows/logic'
import { sampleProposeData } from '@/pages/propose-tradeflows/data'
import { liveProposeData } from '@/pages/propose-tradeflows/live'
import { dealRows, type DealRow } from '@/pages/propose-tradeflows/logic'
import './deal-bls.css'

export interface DealBls { rows: Row[]; usd: number; quantity: number; unit: string; loading: boolean; error: string;
  /** The deal as Propose Tradeflow sees it: amount in USD, assigned, unassigned and its assignment state (null: not a Propose deal). */
  figures: DealRow | null }

interface Snapshot { version: number; deals: DealRow[]; bls: Row[]; error: string }

/**
 * The BLs and the deal figures from the same source and the same calculation as Propose Tradeflow (Deal IDs, BLs with
 * their USD value, rates), read fresh on every visit and again on each `version` (Refresh, after a write).
 */
function useProposeSnapshot(version: number): Snapshot | null {
  const [snap, setSnap] = useState<Snapshot | null>(null)
  useEffect(() => {
    let live = true
    const data = onSampleData('bl-assign') ? sampleProposeData() : liveProposeData()
    Promise.all([data.deals(), data.bls(), data.rates()]).then(
      ([deals, bls, rates]) => { if (live) setSnap({ version, deals: dealRows(deals, bls, rates), bls, error: '' }) },
      (e: Error) => { if (live) setSnap({ version, deals: [], bls: [], error: e.message || 'The BLs could not be read from SAP.' }) }
    )
    return () => { live = false }
  }, [version])
  return snap?.version === version ? snap : null
}

/** The active BLs assigned to a Deal ID, largest first, with their totals and the deal's Propose figures. */
export function useDealBls(dealId: string, version = 0): DealBls {
  const snap = useProposeSnapshot(version)
  const rows = useMemo(() => (snap && dealId ? snap.bls.filter(b => str(b.dealId) === dealId && str(b.deletedFlag) !== 'X')
    .sort((a, b) => Number(str(b.assignedUsd)) - Number(str(a.assignedUsd))) : []), [snap, dealId])
  return {
    rows,
    usd: rows.reduce((s, b) => s + Math.round(Number(str(b.assignedUsd) || 0) * 100), 0) / 100,
    quantity: rows.reduce((s, b) => s + Math.round(Number(str(b.quantity) || 0) * 1000), 0) / 1000,
    unit: str(rows[0]?.unit) || 'LBS',
    loading: !!dealId && !snap,
    error: snap?.error ?? '',
    figures: snap?.deals.find(d => d.dealId === dealId) ?? null
  }
}

function BlTable({ dealId, bls, label }: { dealId: string; bls: DealBls; label: string }) {
  return (
    <DataTable nativeLayout nativeExport aria-label={label}>
      <thead><tr><th className="num">#</th><th>BL No</th><th>BL reference</th><th>BL date</th><th>Trade flow</th><th>Contract</th><th className="num">Quantity ({bls.unit})</th><th className="num">Assigned (USD)</th></tr></thead>
      <tbody>{bls.rows.map((b, i) => (
        <tr key={str(b.blNo)}>
          <td className="num dealbls__sno">{i + 1}</td>
          <td className="mono">{str(b.blNo)}</td>
          <td className="mono">{str(b.blNumber) || '—'}</td>
          <td>{str(b.blDate) ? formatDate(str(b.blDate)) : '—'}</td>
          <td className="mono">{str(b.tfNo)}</td>
          <td>{str(b.contractRef) || '—'}</td>
          <td className="num">{fmtQty(str(b.quantity))}</td>
          <td className="num">{formatAmount(str(b.assignedUsd))}</td>
        </tr>
      ))}</tbody>
      <tfoot><tr><th colSpan={6}>Total · {bls.rows.length} BL{bls.rows.length === 1 ? '' : 's'} on {dealId}</th><th className="num">{fmtQty(bls.quantity.toFixed(3))}</th><th className="num">{formatAmount(bls.usd.toFixed(2))}</th></tr></tfoot>
    </DataTable>
  )
}

/** The panel on the screen: the BLs of the Deal ID before anything is invoiced. */
export function DealBlsPanel({ dealId, bls, canConfirm, why, onReview, action }: { dealId: string; bls: DealBls; canConfirm: boolean; why: string; onReview: () => void; action?: { label: string; busy: boolean; run: () => void } | undefined }) {
  return (
    <section className="card dealbls" aria-label={`BLs assigned to ${dealId}`}>
      <div className="dealbls__top">
        <div className="section-title">Assigned BLs <span className="dealbls__count">{bls.loading ? '…' : bls.rows.length}</span></div>
        <span className="dealbls__meta">{bls.loading ? 'Reading from SAP…' : bls.error ? bls.error : ''}</span>
        {!canConfirm && why && <span className="dealbls__why" title={why}>{why}</span>}
        {action && <button className="button small" type="button" disabled={action.busy} onClick={action.run}>{action.label}</button>}
        <button className="button small dealbls__go" type="button" disabled={!canConfirm || bls.loading} title={canConfirm ? undefined : why} onClick={onReview}><FileCheck2 size={14} />Review &amp; confirm invoice</button>
      </div>
      {!bls.loading && !bls.error && (bls.rows.length
        ? <div className="dealbls__scroll"><BlTable dealId={dealId} bls={bls} label={`BLs assigned to ${dealId}`} /></div>
        : <p className="dealbls__empty">No BLs on {dealId} yet: assign them in Trade Flows → Propose Tradeflow.</p>)}
    </section>
  )
}

const STEPS = ['Review BLs', 'Check amounts', 'Confirm'] as const

/** Before the invoice is generated: the BLs, then the amounts against the deal, then the confirmation. */
export function InvoiceReviewModal({ dealId, bls, dealUsd, invoiceUsd, tolerancePct, message, partial, busy, onClose, onConfirm }: {
  dealId: string; bls: DealBls; dealUsd: number; invoiceUsd: number; tolerancePct: number; message: string; partial: boolean; busy: boolean;
  onClose: () => void; onConfirm: () => void
}) {
  const [step, setStep] = useState(0)
  const diffPct = dealUsd ? ((invoiceUsd - dealUsd) / dealUsd) * 100 : 0
  const blDiffPct = dealUsd ? ((bls.usd - dealUsd) / dealUsd) * 100 : 0
  const tone = (pct: number) => (Math.abs(pct) <= tolerancePct ? 'green' : Math.abs(pct) <= tolerancePct * 3 ? 'amber' : 'red') as 'green' | 'amber' | 'red'
  const pct = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(2)}%`
  return (
    <Modal title={`Invoice for ${dealId}`} eyebrow="Generate invoice" size="wide" busy={busy} onClose={onClose}
      subtitle={`${bls.rows.length} BL${bls.rows.length === 1 ? '' : 's'} · ${fmtQty(bls.quantity.toFixed(3))} ${bls.unit} · ${formatAmount(bls.usd.toFixed(2))} USD assigned`}
      footer={<>
        <button className="button secondary" disabled={busy} onClick={onClose}>Close</button>
        {step > 0 && <button className="button secondary" disabled={busy} onClick={() => setStep(s => s - 1)}><ChevronLeft size={14} />Back</button>}
        {step < 2
          ? <button className="button" disabled={busy || (step === 0 && !bls.rows.length)} onClick={() => setStep(s => s + 1)}>Next: {STEPS[step + 1]}<ChevronRight size={14} /></button>
          : <button className="button" disabled={busy} onClick={onConfirm}><CheckCircle2 size={15} />Confirm invoice generation</button>}
      </>}>
      <div className="dealbls__review">
        <ol className="dealbls__steps" aria-label="Steps">
          {STEPS.map((s, i) => <li key={s} className={i === step ? 'on' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}><span>{i < step ? '✓' : i + 1}</span>{s}</li>)}
        </ol>

        {step === 0 && (
          <section className="dealbls__section">
            <h4>BLs on this Deal ID</h4>
            {bls.rows.length
              ? <div className="dealbls__scroll"><BlTable dealId={dealId} bls={bls} label={`BLs to invoice on ${dealId}`} /></div>
              : <p className="dealbls__empty">No BLs are assigned to {dealId}: assign them in Propose Tradeflow before invoicing.</p>}
          </section>
        )}

        {step === 1 && (
          <section className="dealbls__section">
            <h4>Amounts against the deal</h4>
            <dl className="dealbls__figures">
              <div><dt>FX deal amount</dt><dd>{formatAmount(dealUsd.toFixed(2))} <small>USD</small><span className="num-short">{formatCompact(dealUsd)}</span></dd></div>
              <div className="plus"><dt>BLs assigned</dt><dd>{formatAmount(bls.usd.toFixed(2))} <small>USD · {pct(blDiffPct)}</small><span className="num-short">{formatCompact(bls.usd)}</span></dd></div>
              <div><dt>Invoice amount</dt><dd>{formatAmount(invoiceUsd.toFixed(2))} <small>USD · {pct(diffPct)}</small><span className="num-short">{formatCompact(invoiceUsd)}</span></dd></div>
              <div><dt>Quantity</dt><dd>{fmtQty(bls.quantity.toFixed(3))} <small>{bls.unit}</small></dd></div>
            </dl>
            <div className="dealbls__checks">
              <p><TrafficLightTag tone={tone(blDiffPct)}>{Math.abs(blDiffPct) <= tolerancePct ? 'Within tolerance' : 'Outside tolerance'}</TrafficLightTag> BLs against the FX deal ({pct(blDiffPct)}, tolerance {tolerancePct.toFixed(2)}%)</p>
              <p><TrafficLightTag tone={tone(diffPct)}>{Math.abs(diffPct) <= tolerancePct ? 'Within tolerance' : 'Outside tolerance'}</TrafficLightTag> Invoice against the FX deal ({pct(diffPct)})</p>
              <p><TrafficLightTag tone={partial ? 'amber' : 'green'}>{partial ? 'Partial invoice' : 'Full invoice'}</TrafficLightTag> {message}</p>
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="dealbls__section">
            <h4>Confirm</h4>
            <p className="dealbls__confirm">Generate the {partial ? 'partial' : 'full'} invoice for Deal ID <b>{dealId}</b>: {bls.rows.length} BLs, {fmtQty(bls.quantity.toFixed(3))} {bls.unit}, invoice amount <b>{formatAmount(invoiceUsd.toFixed(2))} USD</b> against an FX deal of {formatAmount(dealUsd.toFixed(2))} USD.</p>
            <p className="dealbls__note">Next comes the compliance check; the invoice is generated only after it.</p>
          </section>
        )}
      </div>
    </Modal>
  )
}

/** View BLs: every BL assigned to the Deal ID (as in the proposal view), with the totals against the FX deal. */
export function AssignedBlsModal({ dealId, bls, dealUsd, tolerancePct, onClose }: { dealId: string; bls: DealBls; dealUsd: number; tolerancePct: number; onClose: () => void }) {
  const [q, setQ] = useState('')
  const term = q.trim().toLowerCase()
  const shown: DealBls = term
    ? (() => {
        const rows = bls.rows.filter(b => ['blNo', 'blNumber', 'tfNo', 'contractRef', 'notifyParty', 'blDate'].some(f => str(b[f]).toLowerCase().includes(term)))
        return { ...bls, rows, usd: rows.reduce((s, b) => s + Math.round(Number(str(b.assignedUsd) || 0) * 100), 0) / 100, quantity: rows.reduce((s, b) => s + Math.round(Number(str(b.quantity) || 0) * 1000), 0) / 1000 }
      })()
    : bls
  const diffPct = dealUsd ? ((bls.usd - dealUsd) / dealUsd) * 100 : 0
  const within = Math.abs(diffPct) <= tolerancePct
  const dates = bls.rows.map(b => str(b.blDate)).filter(Boolean).sort()
  return (
    <Modal title={`BLs assigned to ${dealId}`} eyebrow="View BLs" size="wide" onClose={onClose}
      subtitle={`${bls.rows.length} BL${bls.rows.length === 1 ? '' : 's'} · ${fmtQty(bls.quantity.toFixed(3))} ${bls.unit} · ${formatAmount(bls.usd.toFixed(2))} USD`}
      footer={<button className="button secondary" onClick={onClose}>Close</button>}>
      <div className="dealbls__review">
        {bls.loading ? <p className="dealbls__empty">Reading the BLs from SAP…</p> : bls.error ? <p className="dealbls__empty">{bls.error}</p> : !bls.rows.length ? (
          <p className="dealbls__empty">No BLs are assigned to Deal ID {dealId} yet. Assign them in Trade Flows → Propose Tradeflow.</p>
        ) : <>
          <section className="dealbls__section">
            <h4>Against the FX deal</h4>
            <dl className="dealbls__figures">
              <div><dt>FX deal amount</dt><dd>{formatAmount(dealUsd.toFixed(2))} <small>USD</small><span className="num-short">{formatCompact(dealUsd)}</span></dd></div>
              <div className="plus"><dt>BLs assigned</dt><dd>{formatAmount(bls.usd.toFixed(2))} <small>USD</small><span className="num-short">{formatCompact(bls.usd)}</span></dd></div>
              <div><dt>Difference</dt><dd>{formatAmount((bls.usd - dealUsd).toFixed(2))} <small>USD · {diffPct > 0 ? '+' : ''}{diffPct.toFixed(2)}%</small></dd></div>
              <div><dt>Quantity</dt><dd>{fmtQty(bls.quantity.toFixed(3))} <small>{bls.unit}</small><span className="num-short">{formatCompact(bls.quantity)}</span></dd></div>
            </dl>
            <p className="dealbls__check"><TrafficLightTag tone={within ? 'green' : 'amber'}>{within ? 'Within tolerance' : 'Outside tolerance'}</TrafficLightTag> BLs against the FX deal (tolerance {tolerancePct.toFixed(2)}%){dates.length ? ` · BL dates ${formatDate(dates[0])} → ${formatDate(dates[dates.length - 1])}` : ''}</p>
          </section>
          <section className="dealbls__section">
            <div className="dealbls__bar">
              <h4>BLs</h4>
              <input className="input dealbls__search" placeholder="Search BL, reference, trade flow, contract, notify party" value={q} onChange={e => setQ(e.target.value)} aria-label="Search the BLs" />
            </div>
            {shown.rows.length ? <div className="dealbls__scroll"><BlTable dealId={dealId} bls={shown} label={`BLs assigned to ${dealId}`} /></div> : <p className="dealbls__empty">No BL matches "{q}".</p>}
          </section>
        </>}
      </div>
    </Modal>
  )
}
