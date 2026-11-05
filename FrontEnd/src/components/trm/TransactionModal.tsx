import type { ComponentProps } from 'react';
import { Modal } from '@/components/ui/Modal';

/** SAP Reporting's transaction/class popup frame, shared by every transaction-number hyperlink. */
export function TransactionModal(props: Omit<ComponentProps<typeof Modal>, 'variant'>) {
  return <Modal {...props} variant="transaction" />;
}
