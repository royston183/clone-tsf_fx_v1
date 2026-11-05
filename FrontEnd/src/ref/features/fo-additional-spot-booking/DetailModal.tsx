import { TransactionDetailsDialog } from '../../shared/fx/TransactionDetails.tsx';
import type { DetailKind, SpotRow } from './types.ts';

/** "Transaction Details": the legacy #detailOverlay, opened from either the Original Txn or Spot Txn link. */
export function DetailModal({ row, kind, onClose }: { row: SpotRow; kind: DetailKind; onClose: () => void }) {
  const bukrs = kind === 'spot' ? row.spotCompanyCode ?? '' : row.companyCode
  const rfha = kind === 'spot' ? row.spotTxn : row.originalTxn
  return <TransactionDetailsDialog key={`${bukrs}/${rfha}`} bukrs={bukrs} rfha={rfha} onClose={onClose} />
}
