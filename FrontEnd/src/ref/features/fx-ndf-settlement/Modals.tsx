import { DataTable as UniversalTable } from '@/components/table/DataTable';
import { TransactionDetailsDialog } from '../../shared/fx/TransactionDetails.tsx'
import { isoToDmy } from './format.ts'
import { letterDealTable, runSummary } from './logic.ts'
import { ModalFrame, type Modal } from './modal.tsx'
import type { ConfirmRequest, Deal, LetterModel, RunView } from './types.ts'

/** One label / value pair of a detail grid; an empty value shows a dash. */
function DetailItem({ label, value, full }: { label: string; value: string | number | null | undefined; full?: boolean }) {
  return (
    <div className={`detail-item${full ? ' full' : ''}`}>
      <span className="detail-label">{label}</span>
      <span className="detail-value">{value === '' || value === null || value === undefined ? <span className="cell-muted">—</span> : value}</span>
    </div>
  )
}



/** Transaction Details (hotspot: Transaction No) — TB_TRANSACTION_TO_DISPLAY. */
export function TransactionModal({ modal, row }: { modal: Modal; row: Deal | null }) {
  return modal.isOpen && row ? <TransactionDetailsDialog key={`${row.bukrs}/${row.rfha}`} bukrs={row.bukrs} rfha={row.rfha} onClose={modal.close} /> : null
}

/** FI Document (hotspot: FI Document) — FB03. */
export function FiDocumentModal({ modal, row }: { modal: Modal; row: Deal | null }) {
  return (
    <ModalFrame id="fiModal" modal={modal} title="FI Document" width="w-sm">
      <div className="modal-body-scroll" id="fiModalBody">
        {row ? (
          <div className="detail-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <DetailItem label="Company Code" value={row.bukrs} />
            <DetailItem label="Document Number" value={row.fi_doc} />
            <DetailItem label="Fiscal Year" value={row.delfz.slice(0, 4)} />
            <DetailItem label="Document Type" value="TR" />
            <DetailItem label="Reference" value={row.rfha} />
            <DetailItem label="Currency" value={row.cash_curr} />
            <DetailItem label="Reference Key 2" value="TSF" />
          </div>
        ) : null}
      </div>
    </ModalFrame>
  )
}

/** Bank Settlement: the letter preview (screen 9001). */
export function LetterModal({ modal, model }: { modal: Modal; model: LetterModel | null }) {
  const m = model
  const table = m ? letterDealTable(m) : null
  const isNum = (i: number) => !!table && table.numIdx.includes(i)
  return (
    <ModalFrame id="letterModal" modal={modal} title="Bank Settlement" width="w-lg">
      <div className="modal-body-scroll" id="letterBody">
        {m && table ? (
          <div className="letter">
            {m.addrNote ? <div className="run-note">{m.addrNote}</div> : null}
            <div className="l-date">{m.addr.zdate}</div>
            <div className="l-bank">{m.addr.zbank}</div>
            <div>{m.addr.zaddr1}</div>
            <div>{m.addr.zaddr2}</div>
            <div>{m.addr.zaddr3}</div>
            <div className="l-attn">{m.addr.zattn}</div>
            <div className="l-re">
              <b>RE:</b>
              {m.reg}
            </div>
            <div className="l-vdate">{m.addr.zvdate}</div>
            <div className="l-grid">
              <UniversalTable className="popup-table">
                <thead>
                  <tr>
                    {table.heads.map((h, i) => (
                      <th key={h} className={isNum(i) ? 'num' : undefined}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {table.vals.map((v, i) => (
                      <td key={table.heads[i]} className={isNum(i) ? 'num mono' : undefined}>
                        {v}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </UniversalTable>
            </div>
            <div className="l-grid">
              <UniversalTable className="popup-table">
                <thead>
                  <tr>
                    <th>Account Details</th>
                  </tr>
                </thead>
                <tbody>
                  {m.lines.map((l, i) => (
                    <tr key={i}>
                      <td>{l}</td>
                    </tr>
                  ))}
                </tbody>
              </UniversalTable>
            </div>
            <div className="l-sign">
              <div className="l-auth">Authorized Signatories</div>
              <div className="l-faith">Yours Faithfully</div>
              <div className="l-co">{m.company}</div>
            </div>
          </div>
        ) : null}
      </div>
    </ModalFrame>
  )
}

/** The posting-run result (test run, single post, or Execute with Posting). */
export function RunModal({ modal, view }: { modal: Modal; view: RunView | null }) {
  const sum = view ? runSummary(view.results) : { would: 0, posted: 0, already: 0 }
  return (
    <ModalFrame id="runModal" modal={modal} title={view?.title ?? 'Posting Run'} titleId="runModalTitle" width="w-md">
      <div className="modal-body-scroll" id="runModalBody">
        {view ? (
          <>
            <UniversalTable className="param-table">
              <thead><tr><th>Field</th><th>Value</th></tr></thead>
              <tbody>
                {view.params.map((p) => (
                  <tr key={p[0]}>
                    <td>{p[0]}</td>
                    <td>{p[1]}</td>
                  </tr>
                ))}
              </tbody>
            </UniversalTable>
            <div className="run-summary">
              {sum.would ? (
                <span>
                  <b>{sum.would}</b> would be posted
                </span>
              ) : null}
              {sum.posted ? (
                <span>
                  <b>{sum.posted}</b> posted
                </span>
              ) : null}
              {sum.already ? (
                <span>
                  <b>{sum.already}</b> already posted
                </span>
              ) : null}
            </div>
            <div className="popup-table-wrap">
              <UniversalTable className="popup-table">
                <thead>
                  <tr>
                    <th>Company Code</th>
                    <th>Transaction No</th>
                    <th>Key Date</th>
                    <th>Result</th>
                    <th>FI Document</th>
                  </tr>
                </thead>
                <tbody>
                  {view.results.map((r) => (
                    <tr key={`${r.bukrs}|${r.rfha}`}>
                      <td>{r.bukrs}</td>
                      <td className="mono">{r.rfha}</td>
                      <td className="mono">{isoToDmy(r.keyDate)}</td>
                      <td>
                        <span className={r.cls}>{r.result}</span>
                      </td>
                      <td className="mono">{r.fiDoc ? r.fiDoc : <span className="cell-muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </UniversalTable>
            </div>
            <div className="run-note">{view.notes}</div>
          </>
        ) : null}
      </div>
    </ModalFrame>
  )
}

/** Confirmation before TBB1 Post and Execute with Posting; only its buttons and Escape close it. */
export function ConfirmModal({
  modal,
  request,
  onConfirm,
}: {
  modal: Modal
  request: ConfirmRequest | null
  onConfirm: () => void
}) {
  const isPost = request?.kind !== 'postAll'
  return (
    <ModalFrame
      id="confirmModal"
      modal={modal}
      title={isPost ? 'TBB1 Post' : 'Execute with Posting'}
      titleId="confirmTitle"
      width="w-sm"
      scrollable={false}
      closeOnBackdrop={false}
      actions={
        <div className="modal-actions" style={{ marginTop: 14 }}>
          <button type="button" className="btn btn-secondary" onClick={modal.close}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" id="btnConfirmOk" onClick={onConfirm}>
            {isPost ? 'Post' : 'Post All'}
          </button>
        </div>
      }
    >
      <div id="confirmBody">
        {request?.kind === 'post' ? (
          <p className="confirm-body">
            Post transaction <b>{request.row.rfha}</b> ({request.row.bukrs}) with key date <b>{isoToDmy(request.row.delfz)}</b>?
          </p>
        ) : null}
        {request?.kind === 'postAll' ? (
          <p className="confirm-body">
            Post all <b>{request.count}</b> deal(s) in the current selection with key date <b>{isoToDmy(request.keyDate)}</b>, then reload
            the list?
          </p>
        ) : null}
        {request ? (
          <p className="confirm-body" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
            This runs the posting update and cannot be undone.
          </p>
        ) : null}
      </div>
    </ModalFrame>
  )
}
