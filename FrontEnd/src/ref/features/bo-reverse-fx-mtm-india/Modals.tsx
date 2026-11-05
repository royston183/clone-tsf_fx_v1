import { DataTable as UniversalTable } from '@/components/table/DataTable';
import type { ReactNode } from 'react'
import { TransactionDetailsDialog } from '../../shared/fx/TransactionDetails.tsx'
import { INITIAL_KEY_DATE } from './data.ts'
import { addDays, formatDate, formatNumber } from './format.ts'
import { docInfo } from './logic.ts'
import type { DocField, ModalState, PostLog, Row } from './types.ts'

function Detail({ k, v }: { k: string; v: string }) {
  return (
    <div className="detail">
      <div className="k">{k}</div>
      <div className="v" title={v}>
        {v}
      </div>
    </div>
  )
}



function DocumentBody({ r, field }: { r: Row; field: DocField }) {
  const { isRev, ledger } = docInfo(field)
  return (
    <>
      <div className="detail-grid">
        <Detail k="Document Number" v={r[field]} />
        <Detail k="Company Code" v={r.bukrs} />
        <Detail k="Fiscal Year" v={INITIAL_KEY_DATE.slice(0, 4)} />
        <Detail k="Transaction" v={r.rfha} />
        <Detail k="Document Type" v="TR" />
        <Detail k="Ledger" v={`Ledger ${ledger}`} />
        <Detail k="Posting Date" v={formatDate(isRev ? addDays(INITIAL_KEY_DATE, 1) : INITIAL_KEY_DATE)} />
        <Detail k="Reference" v={r.rfha} />
        <Detail k="Currency" v="INR" />
      </div>
      <div className="section-label">Navigation</div>
      <div style={{ color: '#5D7287', lineHeight: 1.6 }}>In SAP, this hotspot opens the accounting document in FB03.</div>
    </>
  )
}

function LogBody({ logs }: { logs: PostLog[] }) {
  return (
    <UniversalTable className="mini-table">
      <thead>
        <tr>
          <th>Status</th>
          <th>Transaction</th>
          <th>Document</th>
          <th>Type</th>
          <th className="num">Difference</th>
          <th className="num">Contract Rate</th>
          <th>Message</th>
        </tr>
      </thead>
      <tbody>
        {logs.map((l) => (
          <tr key={l.kind}>
            <td className="center">
              <span className={l.ok ? 'ok-icon' : 'err-icon'}>{l.ok ? '✓' : '!'}</span>
            </td>
            <td>{l.rfha}</td>
            <td>{l.doc}</td>
            <td>{l.kind}</td>
            <td className="num">{formatNumber(l.diff, 2)}</td>
            <td className="num">{formatNumber(l.rate, 4)}</td>
            <td>{l.message}</td>
          </tr>
        ))}
      </tbody>
    </UniversalTable>
  )
}

/**
 * The single modal backdrop of the original. The content depends on what was opened; the
 * backdrop stays mounted (hidden) and a click on it, but not on the card, closes it.
 */
export function ModalHost({
  modal,
  rows,
  onClose,
}: {
  modal: ModalState | null
  rows: Row[]
  onClose: () => void
}) {
  let title = ''
  let size = ''
  let body: ReactNode = null
  if (modal) {
    if (modal.kind === 'log') {
      title = 'Message Log'
      size = ' wide'
      body = <LogBody logs={modal.logs} />
    } else {
      const r = rows.find((x) => x.rfha === modal.rfha && (modal.kind !== 'txn' || x.bukrs === modal.bukrs))
      if (r && modal.kind === 'txn') {
        return <TransactionDetailsDialog key={`${r.bukrs}/${r.rfha}`} bukrs={r.bukrs} rfha={r.rfha} onClose={onClose} />
      } else if (r && modal.kind === 'doc') {
        title = docInfo(modal.field).isRev ? 'Reversal FI Document' : 'MTM FI Document'
        size = ' small'
        body = <DocumentBody r={r} field={modal.field} />
      }
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      style={{ display: modal ? 'flex' : 'none' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className={`modal${size}`}>
        <div className="modal-head">
          <div className="modal-title">{title}</div>
          <button className="close-btn" type="button" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">{body}</div>
        <div className="modal-foot">
          <button className="btn compact" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
