import { DataTable as UniversalTable } from '@/components/table/DataTable';
import { TransactionDetailsDialog } from '../../shared/fx/TransactionDetails.tsx'
import { formatAmount } from './format.ts'
import { buildBlRows } from './logic.ts'
import type { SubModalState } from './types.ts'

function BlListBody({ state }: { state: Extract<NonNullable<SubModalState>, { kind: 'bl' }> }) {
  const rows = buildBlRows(state.row)
  return (
    <div className="deal-table-scroll">
      <UniversalTable className="deal-table">
        <thead>
          <tr>
            <th>TF No</th>
            <th>TF Split</th>
            <th>BL No</th>
            <th>BL Split</th>
            <th>BL Date</th>
            <th>Invoice Commodity</th>
            <th>TRM Commodity ID</th>
            <th>Incoterm</th>
            <th>Invoice Date</th>
            <th>Quantity</th>
            <th>Unit</th>
            <th>Price</th>
            <th>Trade Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.blNo}>
              <td>{r.tfNo}</td>
              <td>{r.tfSplit}</td>
              <td>{r.blNo}</td>
              <td>{r.blSplit}</td>
              <td>{r.blDate}</td>
              <td>{r.commodity}</td>
              <td>{r.commodityId}</td>
              <td>{r.incoterm}</td>
              <td>{r.invoiceDate}</td>
              <td className="num">{formatAmount(r.qty)}</td>
              <td>{r.unit}</td>
              <td className="num">{formatAmount(r.price)}</td>
              <td className="num">{formatAmount(r.tradeValue)}</td>
            </tr>
          ))}
        </tbody>
      </UniversalTable>
    </div>
  )
}



/** The small popup stacked on everything else — BL list (from the deal workspace) or a Treasury Transaction display. */
export function SubModal({ state, onClose }: { state: NonNullable<SubModalState>; onClose: () => void }) {
  if (state.kind === 'txn') return <TransactionDetailsDialog key={`${state.fx.bukrs}/${state.fx.rfha}`} bukrs={state.fx.bukrs} rfha={state.fx.rfha} onClose={onClose} />
  const title = `View List of BLs — ${state.row.dealId}`
  return (
    <div className="sub-modal-overlay show" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sub-modal">
        <div className="sub-modal-head">
          <div className="sub-modal-title">{title}</div>
          <button className="sub-modal-close" type="button" aria-label="Close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="sub-modal-body"><BlListBody state={state} /></div>
        <div className="sub-modal-foot">
          <button className="secondary-btn" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
