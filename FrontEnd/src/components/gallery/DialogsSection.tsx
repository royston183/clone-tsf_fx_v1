import { DataTable } from '@/components/table/DataTable';
// src/components/gallery/DialogsSection.tsx
import { useRef, useState, type ReactNode } from 'react';
import type { Row } from '@/lib/grid/types';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Drawer } from '@/components/ui/Drawer';
import { FormDialog } from '@/components/ui/FormDialog';
import { ObjectDialog } from '@/components/ui/ObjectDialog';
import { Popover } from '@/components/ui/Popover';
import { ReviewDialog } from '@/components/ui/ReviewDialog';
import { UploadDialog, type UploadLine } from '@/components/ui/UploadDialog';
import { WizardSteps } from '@/components/ui/WizardSteps';
import { DialogSection } from '@/components/ui/DialogSection';
import { AmountValue } from '@/components/fields/AmountValue';
import { ValueHelpDialog } from '@/components/ui/ValueHelpDialog';
import { DeleteDialog } from '@/components/ui/DeleteDialog';
import { StatusValue } from '@/components/ui/StatusValue';
import { TransactionLookupButton } from '@/components/trm/TransactionProvider';
import { col } from '@/lib/grid/grid';
import { Toast, useToast } from '@/components/ui/Toast';
import { CURRENCIES, DEAL, DEAL_FIELDS } from './samples';
import { galleryItem } from './ids';

type Open = 'form' | 'form2' | 'confirm' | 'danger' | 'review' | 'f4' | 'object' | 'upload' | null;
const UPLOAD: UploadLine[] = [
  { row: 1, status: 'create', cells: { gl: '400100', amount: '1,25,000.00' } },
  { row: 2, status: 'update', cells: { gl: '400200', amount: '80,000.00' } },
  { row: 3, status: 'invalid', cells: { gl: '9999', amount: 'abc' }, problem: "GL account '9999' does not exist · Amount must be an amount." }
];

/** One report row with a transaction number (the NIIF Transaction set answers it). */
const TXN_ROW: Row = { CompanyCode: '1000', FinancialTransaction: '0000001900004', CounterpartyName: 'Example Business Partner' };
const TXN_COLUMNS = [col('CompanyCode', 'Company Code'), col('FinancialTransaction', 'Transaction'), col('CounterpartyName', 'Counterparty')];
function TransactionDemo({ onRow }: { onRow: () => void }) {
  return <div className="ds-grid-wrap"><DataTable className="ds-table" aria-label="Transactions">
    <thead><tr>{TXN_COLUMNS.map(c => <th key={c.field}>{c.label}</th>)}</tr></thead>
    <tbody><tr className="kit-row-open" onClick={onRow}>{TXN_COLUMNS.map(c => <td key={c.field}><StatusValue definition={c} row={TXN_ROW}>{c.text(TXN_ROW)}</StatusValue></td>)}</tr></tbody>
  </DataTable></div>;
}

function Item({ id, note, children }: { id: string; note: string; children: ReactNode }) {
  return <article className="panel kit-gallery-item" data-gallery-id={id}><h3><span className="kit-id">{id}</span>{galleryItem(id).title}</h3><p className="muted">{note}</p><div className="kit-row">{children}</div></article>;
}

export function DialogsSection() {
  const [open, setOpen] = useState<Open>(null);
  const [drawer, setDrawer] = useState<boolean | null>(null);
  const [pop, setPop] = useState<HTMLElement | null>(null);
  const [toast, notify] = useToast();
  const popButton = useRef<HTMLButtonElement>(null);
  const close = () => setOpen(null);
  const done = (text: string) => { close(); notify(text, 'success'); };
  const edited: Row = { ...DEAL, amount: '3000000.00', to: '2032-03-31' };
  return (
    <section className="kit-gallery" aria-labelledby="g-dialogs"><h2 id="g-dialogs">Dialogs and panels</h2>
      <div className="kit-gallery-grid">
        <Item id="D-form" note="Create or edit one record; 1 or 2 columns."><button className="button" onClick={() => setOpen('form')}>Open 1 column</button><button className="button secondary" onClick={() => setOpen('form2')}>Open 2 columns</button></Item>
        <Item id="D-confirm" note="Are you sure? for one action."><button className="button" onClick={() => setOpen('confirm')}>Post</button><button className="button danger" onClick={() => setOpen('danger')}>Reset</button></Item>
        <Item id="D-delete" note="Lists the rows; Yes, Delete N Entries."><DeleteDemo onDone={() => notify('2 entries deleted', 'success')} /></Item>
        <Item id="D-review" note="Field / Current / New before saving."><button className="button" onClick={() => setOpen('review')}>Review</button></Item>
        <Item id="D-valuehelp" note="Search a large list; Enter or double-click picks."><button className="button" onClick={() => setOpen('f4')}>Open F4</button></Item>
        <Item id="D-object" note="Header, tabs and SAP-style display boxes."><button className="button" onClick={() => setOpen('object')}>Open deal</button></Item>
        <Item id="D-drawer" note="Details next to a list; can be widened."><button className="button" onClick={() => setDrawer(true)}>Open drawer</button></Item>
        <Item id="D-popover" note="Small help next to a button."><button ref={popButton} className="button secondary" onClick={() => setPop(p => (p ? null : popButton.current))}>What is this?</button></Item>
        <Item id="D-upload" note="Drop a file, check every row, post the valid ones."><button className="button" onClick={() => setOpen('upload')}>Upload</button></Item>
        <Item id="D-transaction" note="A TRM transaction number opens SAP's FTR_DISPLAY pop-up: any FinancialTransaction, transactionNo or dealNumber column next to the row's company code, or one declared with transaction. The row itself still opens on its own click."><TransactionDemo onRow={() => notify('Row opened', 'success')} /><TransactionLookupButton /></Item>
        <Item id="D-wizard" note="Numbered stages with a clear input section. Upload and review dialogs use this pattern."><WizardSteps steps={['Details', 'Review', 'Save']} current={1} /><DialogSection title="Input details" description="Group related fields under a descriptive heading."><p className="muted">Use one section for each group of related inputs.</p></DialogSection></Item>
      </div>
      {(open === 'form' || open === 'form2') && <FormDialog title="Create Deal" subtitle="Sample data" fields={DEAL_FIELDS} initial={{}} lk={{}} columns={open === 'form2' ? 2 : 1} onClose={close} onSave={() => done('Deal created')} />}
      {open === 'confirm' && <ConfirmDialog title="Post to SAP" message="Post 12 entries for period 04-2026?" confirmLabel="Yes, Post" onClose={close} onConfirm={() => done('Posted')} />}
      {open === 'danger' && <ConfirmDialog title="Reset layout" message="Reset the layout to SAP's default?" warning="Your saved columns and sort are lost." confirmLabel="Yes, Reset" danger onClose={close} onConfirm={() => done('Layout reset')} />}
      {open === 'review' && <ReviewDialog title="Confirm Update" fields={DEAL_FIELDS} before={DEAL} after={edited} lk={{}} onBack={close} onConfirm={() => done('Deal updated')} />}
      {open === 'f4' && <ValueHelpDialog title="Select Currency" items={CURRENCIES} onClose={close} onPick={code => done(`Picked ${code}`)} />}
      {open === 'object' && <ObjectDialog eyebrow="Deal" title="TL-1001" subtitle="Term loan · sample data" onClose={close}
        facts={[{ label: 'Deal', value: 'TL-1001' }, { label: 'Product Type', value: '01 Loan' }, { label: 'Amount', value: <AmountValue value="2500000.00" label="Amount" />, num: true }, { label: 'Currency', value: 'INR' }, { label: 'Purpose', value: '' }]}
        tabs={[{ id: 'basic', label: 'Basic Data', content: <p>Validity 01-04-2026 to 31-03-2031.</p> }, { id: 'flows', label: 'Cash Flows', content: <p>No cash flows yet.</p>, empty: true }]}
        footer={<button className="button secondary" onClick={close}>Close</button>} />}
      {open === 'upload' && <UploadDialog title="Upload Budget" accept={['.xlsx', '.csv']} maxBytes={5 * 1048576} columns={[{ field: 'gl', label: 'GL Account' }, { field: 'amount', label: 'Amount', type: 'amount', align: 'right' }]}
        parse={async () => UPLOAD} onClose={close} onPost={lines => done(`${lines.length} rows posted`)} />}
      {drawer !== null && <Drawer open={drawer} title="Deal TL-1001" storageKey="smui-gallery-drawer" onClose={() => setDrawer(false)}><p>Details next to the list.</p></Drawer>}
      {pop && <Popover anchor={pop} onClose={() => setPop(null)}><p style={{ padding: 12, margin: 0 }}>Amounts are in rupees unless the toolbar says Lakhs or Crores.</p></Popover>}
      <Toast toast={toast} />
    </section>
  );
}

const BUCKET_ROWS = [{ bucket: 'B01', description: 'Up to 1 month' }, { bucket: 'B02', description: '1 to 3 months' }];
const BUCKET_COLS = [col('bucket', 'Bucket', { code: true }), col('description', 'Description')];

function DeleteDemo({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  return <>
    <button className="button danger" onClick={() => setOpen(true)}>Delete 2</button>
    {open && <DeleteDialog title="Delete Time Buckets" rows={BUCKET_ROWS} columns={BUCKET_COLS} keys={['bucket']} onClose={() => setOpen(false)} onConfirm={() => { setOpen(false); onDone(); }} />}
  </>;
}
