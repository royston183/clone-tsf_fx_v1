// The TRM pop-ups of the workspace, ported from the SAP Reporting app (src/pages/trm-deal/Transactions.jsx): mounted once
// in WorkspaceShell, it opens the transaction or security class a TransactionLink names, and the Transaction lookup. A
// pop-up belongs to the page it was opened on: leaving the page closes it. The pop-ups load with their first use.
import { lazy, Suspense, useContext, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowUpRight, Search } from 'lucide-react';
import { usePathname } from '@/lib/client/nav';
import { hotspotOf } from '@/lib/trm/rules';
import type { TransactionTarget } from '@/lib/trm/types';
import { Modal } from '@/components/ui/Modal';
import { TransactionContext } from './context';
import { TransactionLink } from './TransactionLink';

const TransactionDialog = lazy(() => import('./TransactionDialog'));
const ClassDialog = lazy(() => import('./ClassDialog'));

export function TransactionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [shown, setShown] = useState<{ at: string; target: TransactionTarget | null; lookup: boolean } | null>(null);
  const here = shown?.at === pathname ? shown : null;
  const open = (target: TransactionTarget) => setShown({ at: pathname, target, lookup: false });
  const close = () => setShown(null);
  const target = here?.target;
  return (
    <TransactionContext.Provider value={{ open, openLookup: () => setShown({ at: pathname, target: null, lookup: true }) }}>
      {children}
      {here?.lookup && <TransactionLookup onClose={close} />}
      <Suspense fallback={null}>
        {target?.kind === 'deal' && <TransactionDialog key={`${target.bukrs}/${target.deal}`} target={target} onClose={close} />}
        {target?.kind === 'class' && <ClassDialog key={`${target.bukrs}/${target.securityClass}`} target={target} onClose={close} />}
      </Suspense>
    </TransactionContext.Provider>
  );
}

/** Opens the Transaction lookup: any transaction or security class by company code and number. */
export function TransactionLookupButton() {
  const context = useContext(TransactionContext);
  return <button className="button secondary" disabled={!context} onClick={() => context?.openLookup()}><Search size={15} />Transaction lookup</button>;
}

function TransactionLookup({ onClose }: { onClose: () => void }) {
  const [companyCode, setCompanyCode] = useState(''), [number, setNumber] = useState(''), [kind, setKind] = useState<'deal' | 'class'>('deal');
  const context = useContext(TransactionContext);
  const row = { companyCode, ...(kind === 'deal' ? { dealNumber: number } : { securityId: number }) };
  const target = hotspotOf(row);
  function submit(event: FormEvent) { event.preventDefault(); if (target) context?.open(target); }
  return (
    <Modal title="Transaction lookup" subtitle="Display a SAP transaction or a security class and its transactions." onClose={onClose}
      footer={<><button className="button secondary" onClick={onClose}>Cancel</button><button className="button" type="submit" form="transaction-lookup" disabled={!target}>Display<ArrowUpRight size={14} /></button></>}>
      <form id="transaction-lookup" onSubmit={submit}>
        <label className="field"><span>Company code</span><input autoFocus required maxLength={4} pattern="[A-Za-z0-9]{1,4}" value={companyCode} onChange={e => setCompanyCode(e.target.value.toUpperCase())} placeholder="Enter company code" /></label>
        <label className="field"><span id="transaction-kind-label">Display</span><select aria-labelledby="transaction-kind-label" value={kind} onChange={e => setKind(e.target.value === 'class' ? 'class' : 'deal')}><option value="deal">Transaction</option><option value="class">Security class</option></select></label>
        <label className="field"><span>{kind === 'deal' ? 'Transaction number' : 'Security class ID'}</span><input required maxLength={13} pattern="[A-Za-z0-9]{1,13}" value={number} onChange={e => setNumber(e.target.value.toUpperCase())} placeholder={kind === 'deal' ? 'Enter transaction number' : 'Enter security class ID'} /></label>
        {target && <div className="transaction-hotspot-preview"><span>{kind === 'deal' ? 'Txn no.' : 'Class ID'}</span><TransactionLink target={target}>{number}<ArrowUpRight size={13} /></TransactionLink></div>}
      </form>
    </Modal>
  );
}
