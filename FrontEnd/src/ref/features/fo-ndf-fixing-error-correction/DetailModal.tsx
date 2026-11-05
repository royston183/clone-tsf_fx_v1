import { TransactionDetailsDialog } from '../../shared/fx/TransactionDetails.tsx';
import type { NdfRow } from './types.ts';

/** "Transaction Details": the legacy #detailOverlay, opened via the Transaction hotspot or a row double-click. */
export function DetailModal({ row, onClose }: { row: NdfRow; onClose: () => void }) {
  return <TransactionDetailsDialog key={`${row.bukrs}/${row.rfha}`} bukrs={row.bukrs} rfha={row.rfha} onClose={onClose} />
}
