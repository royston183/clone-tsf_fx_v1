import { TransactionDetailsDialog } from '../../shared/fx/TransactionDetails.tsx'
import { type Modal } from './modal.tsx'
import type { Deal } from './types.ts'





/** The original's read-only View Transaction popup, a snapshot of the row it was opened on. */
export function ViewTxnModal({
  modal,
  row,
  onClose,
}: {
  modal: Modal
  row: Deal | null
  isFx: boolean
  onClose: () => void
}) {
  return modal.state === 'open' && row ? <TransactionDetailsDialog key={`${row.BUKRS}/${row.RFHA}`} bukrs={row.BUKRS} rfha={row.RFHA} onClose={onClose} /> : null
}
