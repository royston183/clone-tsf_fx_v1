import { DataTable as UniversalTable } from '@/components/table/DataTable';
import { TransactionDetailsDialog } from '../../shared/fx/TransactionDetails.tsx'
import { STATUS_TEXT_CLASS } from './data.ts'
import { str, targetStatusFor, type StatusSelection } from './logic.ts'
import { OverlayShell, type Overlay } from './modal.tsx'
import type { Deal, MarkedItem, TxnType } from './types.ts'

/** The Txn Status text, coloured by status (an unknown status falls back to the draft colour). */
export function StatusText({ status }: { status: string }) {
  return <span className={`status-text ${STATUS_TEXT_CLASS[status] ?? 'status-text-draft'}`}>{status}</span>
}

type RejectProps = {
  overlay: Overlay
  note: string
  items: MarkedItem[]
  type: TxnType
  /** GET_DATA's status selection: the FX rejection targets depend on it. */
  sel: StatusSelection
  onConfirm: () => void
}

/** Reject confirmation: what will be rejected, the status change and the remark of each deal. */
export function RejectModal({ overlay, note, items, type, sel, onConfirm }: RejectProps) {
  return (
    <OverlayShell id="rejectModal" overlay={overlay}>
      <div className="modal modal-left modal-scrollable reject-modal">
        <div className="modal-head-row">
          <h2>Reject</h2>
          <button type="button" className="modal-close-btn" id="btnRejectClose" aria-label="Close" onClick={overlay.hide}>
            &times;
          </button>
        </div>
        <div className="modal-body-scroll">
          <p className="reject-note" id="rejectNote">
            {note}
          </p>
          <div className="popup-table-wrap">
            <UniversalTable className="popup-table" style={{ minWidth: 520 }}>
              <thead>
                <tr>
                  <th>Transaction</th>
                  <th>Partner</th>
                  <th>Status change</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody id="rejectBody">
                {items.map((it) => (
                  <tr key={it.key}>
                    <td className="mono">{str(it.deal, 'rfha')}</td>
                    <td>{str(it.deal, 'bp_name')}</td>
                    <td>
                      <span className="transition">
                        {str(it.deal, 'txn_status')}
                        <span className="arrow">&rarr;</span>
                        {targetStatusFor(type, str(it.deal, 'txn_status'), sel) || str(it.deal, 'txn_status')}
                      </span>
                    </td>
                    <td>{it.remark ? it.remark : <span style={{ color: 'var(--text-faint)' }}>—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </UniversalTable>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" id="btnRejectCancel" onClick={overlay.hide}>
            Cancel
          </button>
          <button className="btn btn-danger-solid" id="btnRejectConfirm" onClick={onConfirm}>
            Reject
          </button>
        </div>
      </div>
    </OverlayShell>
  )
}

type DealProps = {
  overlay: Overlay
  type: TxnType
  deal: Deal | null
}

/** Read-only Transaction Details, grouped by field group. */
export function DealModal({ overlay, deal }: DealProps) {
  return overlay.isOpen && deal ? <TransactionDetailsDialog key={`${str(deal, 'bukrs')}/${str(deal, 'rfha')}`} bukrs={str(deal, 'bukrs')} rfha={str(deal, 'rfha')} onClose={overlay.hide} /> : null
}
