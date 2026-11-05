import { DataTable as UniversalTable } from '@/components/table/DataTable';
import { formatAmountWhileTyping } from '@/ref/api-client'
import type { ReactNode } from 'react'
import { FEE_CATEGORY_OPTIONS, FEE_CODE_OPTIONS, applyChargeEdit, chargesTotal, fmt2 } from './charges.ts'
import type { ChargeRow } from './charge-types.ts'

export type ChargesModalProps = {
  open: boolean
  rows: ChargeRow[]
  onRowsChange: (rows: ChargeRow[]) => void
  onCancel: () => void
  onApply: (total: number) => void
  /** "Charges" in the OTTK console; the DTTK console switches it per breakdown. */
  title?: string
  subtitle?: string
  /** DTTK adds a footer note; OTTK has none. */
  note?: ReactNode
}

/**
 * A fee breakdown popup, reproducing the #chargesModal of legacy/OTTK.html and
 * legacy/DTTK.html — their markup is identical, so one component serves both.
 *
 * Exactly one row per active fee type, with no add or remove: the grid is a view of the
 * fee-type master list. Which cells are editable depends on Fee Category — '01 %' is
 * percentage-only so Amount is read-only, and '02 Flat Amount' is the mirror case.
 */
export function ChargesModal({
  open,
  rows,
  onRowsChange,
  onCancel,
  onApply,
  title = 'Charges',
  subtitle = 'Other Charges breakdown for this OTTK',
  note,
}: ChargesModalProps) {
  const total = chargesTotal(rows)

  const edit = (index: number, field: keyof ChargeRow, value: string) => {
    const next = rows.slice()
    const row = next[index]
    if (!row) return
    next[index] = applyChargeEdit(row, field, value)
    onRowsChange(next)
  }

  return (
    <div
      className={open ? 'modal-backdrop open' : 'modal-backdrop'}
      aria-hidden={!open}
      role="dialog"
      aria-modal="true"
      aria-labelledby="chargesModalTitle"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <section className="charges-modal">
        <div className="modal-head">
          <div className="modal-heading">
            <div>
              <h2 id="chargesModalTitle">{title}</h2>
              <p>{subtitle}</p>
            </div>
          </div>
          <button type="button" className="modal-close" aria-label="Close Charges" onClick={onCancel}>
            ×
          </button>
        </div>

        <div className="charges-body">
          <div className="charges-table-wrap">
            <UniversalTable className="charges-table">
              <thead>
                <tr>
                  <th style={{ width: 190 }}>Fee Type</th>
                  <th style={{ width: 110 }}>Fee Category</th>
                  <th style={{ width: 130 }}>Code for Collection</th>
                  <th style={{ width: 120 }}>Base Amount</th>
                  <th style={{ width: 80 }}>Int Rate</th>
                  <th style={{ width: 70 }}>Period</th>
                  <th style={{ width: 110 }}>Amount</th>
                  <th style={{ width: 110 }}>Final Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.ZfeeType}>
                    <td>
                      {row.ZfeeType} {row.ZfeeDesc}
                    </td>
                    <td>
                      <select
                        aria-label={`Fee category for ${row.ZfeeType}`}
                        value={row.Zcat}
                        onChange={(e) => edit(index, 'Zcat', e.target.value)}
                      >
                        <option value="" />
                        {FEE_CATEGORY_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        aria-label={`Code for collection for ${row.ZfeeType}`}
                        value={row.Zcode}
                        onChange={(e) => edit(index, 'Zcode', e.target.value)}
                      >
                        <option value="" />
                        {FEE_CODE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input className="amt" readOnly value={row.ZbAmt} aria-label={`Base amount for ${row.ZfeeType}`} />
                    </td>
                    <td>
                      <input
                        className="amt"
                        inputMode="decimal"
                        aria-label={`Interest rate for ${row.ZfeeType}`}
                        value={row.Zrate}
                        readOnly={row.Zcat === '02'}
                        onChange={(e) => edit(index, 'Zrate', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        maxLength={5}
                        inputMode="numeric"
                        aria-label={`Period for ${row.ZfeeType}`}
                        value={row.Zday}
                        readOnly={row.Zcat === '02'}
                        onChange={(e) => edit(index, 'Zday', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        className="amt"
                        inputMode="decimal"
                        aria-label={`Amount for ${row.ZfeeType}`}
                        value={row.Zamt}
                        readOnly={row.Zcat === '01'}
                        onChange={(e) => edit(index, 'Zamt', formatAmountWhileTyping(e.target.value))}
                      />
                    </td>
                    <td>
                      <input
                        className="amt"
                        readOnly
                        value={row.ZfAmt}
                        aria-label={`Final amount for ${row.ZfeeType}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </UniversalTable>
          </div>
        </div>

        <div className="modal-footer">
          <div className="charges-footer-total">
            Grand total <input readOnly value={fmt2(total)} aria-label="Grand total" />
          </div>
          <div className="modal-actions">
            {note ? <span className="charges-note">{note}</span> : null}
            <button type="button" className="btn" onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="btn primary" onClick={() => onApply(total)}>
              Apply
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
