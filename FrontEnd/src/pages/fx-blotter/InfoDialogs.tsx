// Read-only and simple popups of the FX Blotter: View Transaction, Master Contract, View Txn List, Upload, Notes, Info.
import { useState, type ReactNode } from 'react';
import { Modal } from '@/components/ui/Modal';
import { AmountInput } from '@/components/fields/AmountInput';
import { DialogSection } from '@/components/ui/DialogSection';
import { TrafficLightTag } from '@/components/ui/Badge';
import { FxTable, type FxColumn } from '@/pages/fx/FxTable';
import { amt, date, rate } from '@/pages/fx/format';
import { TXN_STATUS } from '@/pages/fx/sample';
import { type BlotterRow, type Mc, typeLabel } from './data';
import { useMasters } from './masters';
import { amount2, mcBalance, num, opposite, rateNum, spotOf, statusTone } from './logic';

export const Facts = ({ items }: { items: [string, ReactNode][] }) => (
  <dl className="tsf-facts">{items.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v === '' || v == null ? '–' : v}</dd></div>)}</dl>
);
export const StatusTag = ({ s }: { s: BlotterRow['status'] }) => {
  const t = statusTone(s);
  return t === 'neutral' ? <span className="pill">{s}</span> : <TrafficLightTag tone={t}>{s}</TrafficLightTag>;
};
export const txnStatusOf = (r: BlotterRow): string => r.txnStatus ? `${r.txnStatus} - ${r.statusText || TXN_STATUS[r.txnStatus] || ''}` :
  r.status === 'Draft' ? '–' : r.status === 'Created' ? `01 - ${TXN_STATUS['01']}` : r.status === 'Released' ? `03 - ${TXN_STATUS['03']}` : `05 - ${TXN_STATUS['05']}`;

export function InfoDialog({ title, message, onClose }: { title: string; message: ReactNode; onClose: () => void }) {
  return <Modal size="small" title={title} onClose={onClose} onEnter={onClose} initialFocus="dialog" footer={<button className="button" onClick={onClose}>Close</button>}><p>{message}</p></Modal>;
}

export function ViewTxnDialog({ row, onMc, onClose }: { row: BlotterRow; onMc: (mc: string) => void; onClose: () => void }) {
  const { bankText, companyText } = useMasters();
  const ndf = Boolean(row.fixDate);
  return (
    <Modal size="wide" eyebrow="Transaction" title={row.ref} status={<StatusTag s={row.status} />} subtitle="Read-only view of the transaction as created in SAP." onClose={onClose} footer={<button className="button secondary" onClick={onClose}>Close</button>}>
      <DialogSection title="Transaction">
        <Facts items={[['Status', row.status], ['Reference', row.ref], ['Trade Date', date(row.tradeDate)], ['Company Code', `${row.company} - ${companyText(row.company)}`], ['Bank BP', row.bankName || bankText(row.bank)],
          ['Transaction Type', typeLabel(row.txnType)], ['Buy / Sell', row.bs1], ['Mode of Trade', row.mode], ['Acc Category', row.accCat], ['Profit Center', row.profit], ['Unit(BA)', row.unit]]} />
      </DialogSection>
      <DialogSection title="Amounts and rates">
        <Facts items={[['Currency 1', row.cur1], ['Amount 1', amt(num(row.amount1))], ['Currency 2', row.cur2], ['Amount 2', amt(amount2(row))],
          ['All in Rate', rate(rateNum(row.rate))], ['Swap', rate(rateNum(row.swap), 2)], ['Spot', rate(spotOf(row))], ['Value Date', date(row.valueDate)]]} />
      </DialogSection>
      {ndf && <DialogSection title="NDF"><Facts items={[['NDF Fixing Date', date(row.fixDate)], ['NDF Fixing Ref', row.fixRef]]} /></DialogSection>}
      <DialogSection title="Deal">
        <Facts items={[['Master Contract', row.mc ? <button className="tsf-link" onClick={() => onMc(row.mc)}>{row.mc}</button> : '–'], ['Deal ID', row.dealId], ['Deal Type', row.dealType], ['SAP Txn Status', txnStatusOf(row)]]} />
      </DialogSection>
    </Modal>
  );
}

export function McDialog({ mc, onClose }: { mc: Mc; onClose: () => void }) {
  const [a, b, c] = mc.entityString.split('-');
  return (
    <Modal size="small" eyebrow="Master Contract" title={mc.mc} subtitle={`${mc.model}`} onClose={onClose} footer={<button className="button secondary" onClick={onClose}>Close</button>}>
      <Facts items={[['Master Contract', mc.mc], ['FX Model', mc.model], ['Entity String', `${a} → ${b} → ${c}`], ['Currency Pair', mc.pair], ['Commodity', mc.commodity], ['MC Date', date(mc.mcDate)],
        ['Shipping Window', `${date(mc.shipStart)} – ${date(mc.shipEnd)}`], ['MC Amount (USD)', amt(mc.amountUsd)], ['Utilized (USD)', amt(mc.usedUsd)], ['Remaining Balance (USD)', amt(mcBalance(mc))]]} />
    </Modal>
  );
}

const LIST_COLS: FxColumn<BlotterRow>[] = [
  { id: 'status', label: 'Status', kind: 'status', value: r => r.status, render: r => <StatusTag s={r.status} /> },
  { id: 'ref', label: 'RFHA / Draft', kind: 'code', value: r => r.ref },
  { id: 'deal', label: 'Deal ID', kind: 'code', value: r => r.dealId || '–' },
  { id: 'type', label: 'Txn Type', value: r => r.txnType },
  { id: 'bs', label: 'B/S 1', value: r => r.bs1 },
  { id: 'c1', label: 'Curr 1', value: r => r.cur1 },
  { id: 'a1', label: 'Amount 1', kind: 'amount', value: r => num(r.amount1), render: r => amt(num(r.amount1)) },
  { id: 'rate', label: 'All in Rate', kind: 'rate', value: r => rateNum(r.rate), render: r => rate(rateNum(r.rate)) },
  { id: 'vd', label: 'Value Date', kind: 'date', value: r => r.valueDate, render: r => date(r.valueDate) }
];

export function TxnListDialog({ rows, onView, onClose }: { rows: BlotterRow[]; onView: (r: BlotterRow) => void; onClose: () => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [status, setStatus] = useState('All');
  const shown = rows.filter(r => status === 'All' || r.status === status);
  const one = rows.find(r => r.id === picked[0]);
  return (
    <Modal size="wide" title="View Txn List" subtitle="All transactions of the loaded blotter." onClose={onClose}
      footerStart={<button className="button secondary" disabled={!one} onClick={() => one && onView(one)}>View Transaction</button>}
      footer={<button className="button secondary" onClick={onClose}>Close</button>}>
      <div className="tsf-toolbar">
        <label className="tsf-field">Status
          <select value={status} onChange={e => setStatus(e.target.value)}>{['All', 'Draft', 'Created', 'Released', 'Reversed'].map(s => <option key={s}>{s}</option>)}</select>
        </label>
        <span className="tsf-count">{shown.length} transaction(s)</span>
      </div>
      <FxTable label="Transaction list" columns={LIST_COLS} rows={shown} rowKey={r => r.id} select="single" picked={picked} onPick={setPicked} pageSizes={[10, 20]}
        rowClass={r => (r.status === 'Reversed' ? 'is-reversed' : '')} empty="No transactions to list." />
    </Modal>
  );
}

export function UploadDialog({ date: d, group, trader, onNotify, onClose }: { date: string; group: string; trader: string; onNotify: (t: string, k?: 'info' | 'success' | 'error') => void; onClose: () => void }) {
  const [bd, setBd] = useState(d);
  const [g, setG] = useState(group);
  const [t, setT] = useState(trader);
  const [level, setLevel] = useState('create');
  const [file, setFile] = useState('');
  const { groups } = useMasters();
  const traders = groups.find(x => x.code === g)?.traders ?? [];
  const submit = () => {
    if (!file) { onNotify('Choose an .xlsx or .csv file to upload.', 'error'); return; }
    onNotify(`Not saved: the file ${file} was not read. SAP posting is connected in the next round.`, 'info');
    onClose();
  };
  return (
    <Modal size="normal" title="Upload Blotter" subtitle="Upload a filled template to create deals in bulk." onClose={onClose} onPrimary={submit}
      footerStart={<button className="button secondary" onClick={() => onNotify('The template download is connected in the next round.', 'info')}>Download Template</button>}
      footer={<><button className="button secondary" onClick={onClose}>Cancel</button><button className="button" onClick={submit}>Upload</button></>}>
      <DialogSection title="Blotter context">
        <div className="tsf-fields">
          <label className="tsf-field">Blotter Date<input type="date" value={bd} onChange={e => setBd(e.target.value)} /></label>
          <label className="tsf-field">Group<select value={g} onChange={e => { setG(e.target.value); setT(''); }}>{groups.map(x => <option key={x.code} value={x.code}>{x.code} {x.text}</option>)}</select></label>
          <label className="tsf-field">Trader / Trade Code<select value={t} onChange={e => setT(e.target.value)}><option value="">Select trader</option>{traders.map(x => <option key={x.code} value={x.code}>{x.text}</option>)}</select></label>
        </div>
      </DialogSection>
      <DialogSection title="Processing level">
        <div className="bl-radios" role="radiogroup" aria-label="Processing level">
          {[['create', 'Create Deal'], ['contract', 'Contract'], ['mo', 'Release to MO']].map(([v, l]) => (
            <label key={v}><input type="radio" name="level" checked={level === v} onChange={() => setLevel(v)} /> {l}</label>
          ))}
        </div>
      </DialogSection>
      <DialogSection title="File">
        <label className="tsf-field">Blotter file (.xlsx, .csv)<input type="file" accept=".xlsx,.csv" onChange={e => setFile(e.target.files?.[0]?.name ?? '')} /></label>
      </DialogSection>
    </Modal>
  );
}

export function NotesDialog({ onNotify, onClose }: { onNotify: (t: string, k?: 'info' | 'success' | 'error') => void; onClose: () => void }) {
  const [text, setText] = useState('');
  return (
    <Modal size="normal" title="Notes" subtitle="Working notes for this blotter." onClose={onClose}
      footer={<><button className="button secondary" onClick={onClose}>Close</button><button className="button" onClick={() => { onNotify('Notes saved (sample).', 'success'); onClose(); }}>Save Notes</button></>}>
      <DialogSection title="Reminders">
        <ul className="bl-notes">
          <li>Draft rows are editable in place; Created rows are read-only apart from Release and Reverse.</li>
          <li>Create all transactions in SAP before releasing them to the Mid Office.</li>
          <li>A D1/D2 pair needs opposite sides of the same currency pair under one Master Contract.</li>
          <li>Lock the blotter at the end of the day once everything is released.</li>
        </ul>
      </DialogSection>
      <DialogSection title="Your notes">
        <label className="tsf-field">Notes<textarea value={text} onChange={e => setText(e.target.value)} placeholder="Type a note for the day..." /></label>
      </DialogSection>
    </Modal>
  );
}

export interface SpotDraft { company: string; txnType: string; bank: string; rate: string; buy: string; sell: string; tradeDate: string; valueDate: string }
export function SpotDialog({ dealId, base, onCreate, onClose }: { dealId: string; base: SpotDraft; onCreate: (d: SpotDraft) => void; onClose: () => void }) {
  const { banks, companies } = useMasters();
  const [d, setD] = useState(base);
  const [error, setError] = useState('');
  const set = (p: Partial<SpotDraft>) => { setD(x => ({ ...x, ...p })); setError(''); };
  const submit = () => {
    if (!(num(d.buy) > 0) || !(num(d.sell) > 0)) { setError('Buy Amount and Sell Amount must be greater than zero.'); return; }
    onCreate(d);
  };
  return (
    <Modal size="wide" title="Auto Spot" subtitle="Create a spot deal with its DSS deal type." onClose={onClose} onPrimary={submit}
      footer={<><button className="button secondary" onClick={onClose}>Cancel</button><button className="button" onClick={submit}>Create Spot Deal</button></>}>
      {error && <div className="tsf-check bad" role="alert">{error}</div>}
      <DialogSection title="Deal">
        <div className="tsf-fields">
          <label className="tsf-field">Deal ID<input readOnly value={dealId} /></label>
          <label className="tsf-field">FX Deal Type<input readOnly value="DS1" /></label>
          <label className="tsf-field">DSS Deal Type<input readOnly value="DSS2" /></label>
          <label className="tsf-field">Company Code*<select value={d.company} onChange={e => set({ company: e.target.value })}>{companies.map(c => <option key={c.code} value={c.code}>{c.code} - {c.text}</option>)}</select></label>
          <label className="tsf-field">Transaction Type*<select value={d.txnType} onChange={e => set({ txnType: e.target.value })}><option value="SPOT">{typeLabel('SPOT')}</option><option value="TOM">{typeLabel('TOM')}</option></select></label>
          <label className="tsf-field">Business Partner*<select value={d.bank} onChange={e => set({ bank: e.target.value })}>{banks.map(b => <option key={b.code} value={b.code}>{b.text}</option>)}</select></label>
        </div>
      </DialogSection>
      <DialogSection title="Dates and rate">
        <div className="tsf-fields">
          <label className="tsf-field">Trade Date<input type="date" value={d.tradeDate} onChange={e => set({ tradeDate: e.target.value })} /></label>
          <label className="tsf-field">Value Date (T+2)<input type="date" value={d.valueDate} onChange={e => set({ valueDate: e.target.value })} /></label>
          <label className="tsf-field">Spot Rate<input inputMode="decimal" value={d.rate} onChange={e => set({ rate: e.target.value })} /></label>
        </div>
      </DialogSection>
      <DialogSection title="Amounts">
        <div className="tsf-fields">
          <label className="tsf-field">Buy Currency<input readOnly value="USD" /></label>
          <div className="tsf-field"><span>Buy Amount*</span><AmountField label="Buy Amount" value={d.buy} onValue={v => set({ buy: v, sell: String(Math.round(num(v) * rateNum(d.rate) * 100) / 100) })} /></div>
          <label className="tsf-field">Sell Currency<input readOnly value="INR" /></label>
          <div className="tsf-field"><span>Sell Amount*</span><AmountField label="Sell Amount" value={d.sell} onValue={v => set({ sell: v })} /></div>
        </div>
        <small className="tsf-sample">B/S of the second leg: {opposite('Buy')}</small>
      </DialogSection>
    </Modal>
  );
}

export const AmountField = ({ label, value, onValue }: { label: string; value: string; onValue: (v: string) => void }) => <AmountInput value={value} label={label} onValue={onValue} />;
