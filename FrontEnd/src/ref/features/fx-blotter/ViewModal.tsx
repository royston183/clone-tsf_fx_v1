import { TransactionDetailsDialog } from '../../shared/fx/TransactionDetails.tsx';
import { DetailGrid, ModalHeader, Overlay, type ModalStack } from './modal.tsx';

export type ViewContent = { subtitle: string; pairs: Array<[string, string]> } & ({ kind: 'row'; bukrs: string; rfha: string } | { kind: 'mc' })

/** Transaction Display for a row, or the Master Contract behind an MC Ref link. */
export function ViewModal({ modals, content }: { modals: ModalStack; content: ViewContent }) {
  const close = () => modals.close('view')
  if (content.kind === 'row') return modals.isOpen('view') && content.bukrs && content.rfha ? <TransactionDetailsDialog key={`${content.bukrs}/${content.rfha}`} bukrs={content.bukrs} rfha={content.rfha} onClose={close} /> : null
  return (
    <Overlay id="view" modals={modals}>
      <div className="modal-card" style={{ maxWidth: 'min(640px, calc(100vw - 40px))' }}>
        <ModalHeader title="Master Contract Details" subtitle={content.subtitle} onClose={close} />
        <div className="modal-body">
          <DetailGrid pairs={content.pairs} />
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-cancel" onClick={close}>
            Close
          </button>
        </div>
      </div>
    </Overlay>
  )
}
