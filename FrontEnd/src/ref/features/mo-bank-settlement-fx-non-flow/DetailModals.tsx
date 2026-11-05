import type { ReactNode } from 'react'
import { TransactionDetailsDialog } from '../../shared/fx/TransactionDetails.tsx'
import { DASH, fmtDate, fmtNum } from './format.ts'
import { Overlay, type Modal } from './modal.tsx'
import type { Deal } from './types.ts'

function Cell({ label, accent, children }: { label: string; accent?: boolean; children: ReactNode }) {
  return (
    <div className="detail-cell">
      <div className="detail-lbl">{label}</div>
      <div className={`detail-val${accent ? ' accent' : ''}`}>{children}</div>
    </div>
  )
}



/** Transaction Details (RFHA hotspot -> TB_TRANSACTION_TO_DISPLAY). */
export function TxnModal({
  modal,
  deal,
}: {
  modal: Modal
  deal: Deal | null
  /** T001 code -> name. */
  companies: Readonly<Record<string, string>>
}) {
  return modal.isOpen && deal ? <TransactionDetailsDialog key={`${deal.bukrs}/${deal.rfha}`} bukrs={deal.bukrs} rfha={deal.rfha} onClose={modal.close} /> : null
}

/** Settlement Document (FI_DOC hotspot -> FB03). */
export function DocModal({ modal, deal }: { modal: Modal; deal: Deal | null }) {
  const d = deal
  return (
    <Overlay id="doc-overlay" modal={modal}>
      <div className="modal-card" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <div className="modal-header-text">
            <div className="modal-title">Settlement Document</div>
            <div className="modal-subtitle">Display document (FB03)</div>
          </div>
          <button className="modal-close" type="button" onClick={modal.close}>
            ×
          </button>
        </div>
        <div className="modal-body">
          {d && d.fiDoc ? (
            <div className="detail-grid" id="doc-grid">
              <Cell label="Document No." accent>
                {d.fiDoc}
              </Cell>
              <Cell label="Company Code">{d.bukrs}</Cell>
              <Cell label="Fiscal Year">{d.valueDate.substring(0, 4)}</Cell>
              <Cell label="Posting Date">{fmtDate(d.valueDate)}</Cell>
              <Cell label="Currency">{d.settleCurr}</Cell>
              <Cell label="Amount">{fmtNum(d.settleAmt)}</Cell>
              <Cell label="Reference (Txn No)">{d.rfha}</Cell>
              <Cell label="Companion Document">{d.doc2 && d.doc2 !== d.fiDoc ? d.doc2 : DASH}</Cell>
            </div>
          ) : null}
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" type="button" onClick={modal.close}>
            Close
          </button>
        </div>
      </div>
    </Overlay>
  )
}
