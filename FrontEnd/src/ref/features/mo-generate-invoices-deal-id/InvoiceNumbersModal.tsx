import { DataTable as UniversalTable } from '@/components/table/DataTable'
import { money } from './format.ts'
import type { InvRow } from './types.ts'

/** "Invoice Numbers": the invoices of a confirmed Deal ID — each leg's invoice number and its trade invoice (TRM) reference. */
export function InvoiceNumbersModal({ dealId, status, rows, onClose }: { dealId: string; status: string; rows: InvRow[]; onClose: () => void }) {
  return (
    <div className="modal-overlay open" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal md" style={{ width: "min(1100px, 96vw)" }}>
        <div className="modal-head">
          <div className="modal-title">Invoice Numbers · Deal ID {dealId} · status {status}</div>
          <button className="modal-close" type="button" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <div className="mini-grid" style={{ maxHeight: 430 }}>
            <UniversalTable>
              <thead>
                <tr>
                  <th>Trade Type</th>
                  <th>Invoice No</th>
                  <th>Trade Invoice (TRM) Ref No</th>
                  <th>Seller</th>
                  <th>Buyer</th>
                  <th>Invoice Date</th>
                  <th className="num">Final Inv Amt</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.ttype}-${r.invNo}`}>
                    <td>{r.ttype}</td>
                    <td className="mono"><b>{r.invNo}</b></td>
                    <td className="mono">{r.invTrmRef || '—'}</td>
                    <td>{r.seller}</td>
                    <td>{r.buyer}</td>
                    <td>{r.invDate}</td>
                    <td className="num">{money(r.amt, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </UniversalTable>
          </div>
        </div>
        <div className="modal-foot">
          <button className="action-btn primary" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
