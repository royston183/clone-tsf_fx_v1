import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { DialogSection } from '@/components/ui/DialogSection';
import { TrafficLightTag } from '@/components/ui/Badge';
import { amt, date, rate } from '@/pages/fx/format';
import { plAmount } from './logic';
import { FxTable, type FxColumn } from '@/pages/fx/FxTable';
import { BANK_TYPES, TRANSFER_TYPES, recPay, type Deal, type DiffRow, type FxLeg, type InvLeg, type Side } from './data';

const Facts = ({ items }: { items: [string, string][] }) => (
  <dl className="tsf-facts">{items.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v || '—'}</dd></div>)}</dl>
);

export function AmendEndDateModal({ current, onClose, onUpdate }: { current: string; onClose: () => void; onUpdate: (iso: string) => void }) {
  const [value, setValue] = useState('');
  const [err, setErr] = useState('');
  const go = () => { if (!value) setErr('Enter a date first.'); else onUpdate(value); };
  return (
    <Modal size="small" title="Amend Deal End Date" subtitle={`Current end date ${date(current)}`} onClose={onClose} onPrimary={go} onEnter={go}
      footer={<><button className="button secondary" onClick={onClose}>Cancel</button><button className="button" onClick={go}>Update Deal End Date</button></>}>
      <DialogSection title="New date">
        <label className="tsf-field">Revised Deal End Date *
          <input type="date" value={value} aria-invalid={!!err} onChange={e => { setValue(e.target.value); setErr(''); }} data-autofocus />
          {err && <span className="tsf-err" role="alert">{err}</span>}
        </label>
      </DialogSection>
    </Modal>
  );
}

export function HeadsUpModal({ deal, onClose }: { deal: Deal; onClose: () => void }) {
  const cols: FxColumn<Deal['heads'][number]>[] = [
    { id: 'entity', label: 'Entity', value: r => r.entity }, { id: 'trade', label: 'Trade Type', kind: 'code', value: r => r.trade },
    { id: 'fx', label: 'FX Deal Amount', kind: 'amount', value: r => r.fxAmt, render: r => amt(r.fxAmt) },
    { id: 'inv', label: 'Final Invoice Amount', kind: 'amount', value: r => r.invAmt, render: r => amt(r.invAmt) },
    { id: 'diff', label: 'Difference', kind: 'amount', value: r => r.diff, render: r => amt(r.diff) },
    { id: 'cur', label: 'Currency', kind: 'code', value: r => r.cur }, { id: 'act', label: 'Action FX', value: r => r.action }
  ];
  return (
    <Modal size="wide" title="Heads Up" subtitle={`Deal ID ${deal.id}: FX deal amount against final invoice amount`} onClose={onClose} footer={<button className="button secondary" onClick={onClose}>Close</button>}>
      <>
        {deal.headsNotice && <p className="tsf-hint">{deal.headsNotice}</p>}
        <FxTable label="Heads up" columns={cols} rows={deal.heads} rowKey={r => r.trade} empty="No difference to act on." />
      </>
    </Modal>
  );
}

export function DiffModal({ deal, busy, onClose, onSave }: { deal: Deal; busy: boolean; onClose: () => void; onSave: () => void }) {
  const cols: FxColumn<DiffRow>[] = [
    { id: 'trade', label: 'Trade', kind: 'code', value: r => r.trade }, { id: 'cur', label: 'Curr', kind: 'code', value: r => r.cur },
    { id: 'pl', label: 'Planned Amt', kind: 'amount', value: r => r.planned, render: r => amt(r.planned) },
    { id: 'fi', label: 'Final Invoice Amt', kind: 'amount', value: r => r.finalInv, render: r => amt(r.finalInv) },
    { id: 'dt', label: 'Deal Type', kind: 'code', value: r => r.dealType },
    { id: 'da', label: 'Deal Amt', kind: 'amount', value: r => r.dealAmt, render: r => amt(r.dealAmt) },
    { id: 'df', label: 'Difference', kind: 'amount', value: r => r.diff, render: r => amt(r.diff) },
    { id: 'sc', label: 'Spot Co.', kind: 'code', value: r => r.spotCo }, { id: 'bs', label: 'B/S', value: r => r.bs },
    { id: 'sv', label: 'Saved', kind: 'status', value: r => (r.saved ? 'Yes' : 'No'), render: r => <TrafficLightTag tone={r.saved ? 'green' : 'amber'}>{r.saved ? 'Saved' : 'Not saved'}</TrafficLightTag> }
  ];
  return (
    <Modal size="wide" title="FX – Invoice Difference" subtitle={`Deal ID ${deal.id}`} onClose={onClose}
      footer={<><button className="button secondary" onClick={onClose}>Close</button><button className="button" disabled={busy} onClick={onSave}>Save Difference</button></>}>
      <FxTable label="FX invoice difference" columns={cols} rows={deal.diffs} rowKey={r => r.trade + r.cur} empty="No difference rows." />
    </Modal>
  );
}

export function PnlModal({ deal, onClose }: { deal: Deal; onClose: () => void }) {
  const pnl = (l: FxLeg) => plAmount(deal.fx, l);
  const cols: FxColumn<FxLeg>[] = [
    { id: 'seq', label: 'Seq', kind: 'code', value: l => l.seq }, { id: 'type', label: 'Deal Type', kind: 'code', value: l => l.type },
    { id: 'txn', label: 'Transaction', kind: 'code', value: l => l.txn },
    { id: 'rate', label: 'All-in Rate', kind: 'rate', value: l => l.rate, render: l => rate(l.rate) },
    { id: 'amt', label: 'Amount 1', kind: 'amount', value: l => l.amt1, render: l => `${amt(l.amt1)} ${l.cur1}` },
    { id: 'pnl', label: 'P&L (INR)', kind: 'amount', value: l => pnl(l), render: l => { const v = pnl(l); return v === null ? '—' : amt(v); } }
  ];
  return (
    <Modal size="normal" title="View P&L" subtitle="P&L = (D2 rate − D1 rate) × D1 Amount 1, shown on the D2 row" onClose={onClose} footer={<button className="button secondary" onClick={onClose}>Close</button>}>
      <FxTable label="Profit and loss" columns={cols} rows={deal.fx} rowKey={l => l.key} empty="No FX legs." />
    </Modal>
  );
}

export function InvoiceViewModal({ deal, onClose }: { deal: Deal; onClose: () => void }) {
  const cols: FxColumn<InvLeg>[] = [
    { id: 'leg', label: 'Leg', kind: 'code', value: l => l.leg }, { id: 'ent', label: 'Entity Leg', value: l => l.desc },
    { id: 'ref', label: 'Reference', value: l => l.ref },
    { id: 'amt', label: 'Invoice Amt', kind: 'amount', value: l => l.invAmt, render: l => amt(l.invAmt) },
    { id: 'cur', label: 'Curr', kind: 'code', value: l => l.invCur }, { id: 'due', label: 'Due Date', kind: 'date', value: l => l.due, render: l => date(l.due) },
    { id: 'st', label: 'Status', kind: 'status', value: l => (l.settled ? 'Settled' : 'Open'), render: l => <TrafficLightTag tone={l.settled ? 'green' : 'amber'}>{l.settled ? 'Settled' : 'Open'}</TrafficLightTag> }
  ];
  return (
    <Modal size="wide" title="View Trade Invoice" subtitle={`Deal ID ${deal.id}`} onClose={onClose} footer={<button className="button secondary" onClick={onClose}>Close</button>}>
      <FxTable label="Trade invoices" columns={cols} rows={deal.inv} rowKey={l => l.leg} empty="No trade invoice." />
    </Modal>
  );
}

function BankFields({ side, set, locked, remitLock }: { side: Side; set: (s: Side) => void; locked?: boolean; remitLock?: boolean }) {
  const off = locked || remitLock;
  const text = (field: keyof Side, max: number) => (e: { target: { value: string } }) => set({ ...side, [field]: e.target.value.toUpperCase().slice(0, max) });
  return (
    <div className="tsf-fields">
      <label className="tsf-field">Co Code<input value={side.coCode} maxLength={4} disabled={locked} onChange={text('coCode', 4)} /></label>
      <label className="tsf-field">Bank ID<input value={side.bankId} maxLength={10} disabled={off} onChange={text('bankId', 10)} /></label>
      <label className="tsf-field">Payment ID<input value={side.payId} maxLength={10} disabled={off} onChange={text('payId', 10)} /></label>
      <label className="tsf-field">House Bank<input value={side.house} maxLength={5} disabled={off} onChange={text('house', 5)} /></label>
      <label className="tsf-field">Account ID<input value={side.account} maxLength={5} disabled={off} onChange={text('account', 5)} /></label>
    </div>
  );
}

export function TxnModal({ leg, onClose, onPrint, onUpdate, onSettle }: {
  leg: FxLeg; onClose: () => void; onPrint: () => void; onUpdate: (d: FxLeg) => void; onSettle: (d: FxLeg) => boolean;
}) {
  const [d, setD] = useState<FxLeg>(leg);
  const buyIs1 = d.bs1 === 'Buy';
  const buy = { cur: buyIs1 ? d.cur1 : d.cur2, amount: buyIs1 ? d.amt1 : d.amt2 };
  const sell = { cur: buyIs1 ? d.cur2 : d.cur1, amount: buyIs1 ? d.amt2 : d.amt1 };
  const settle = () => { if (onSettle(d)) onClose(); };
  return (
    <Modal size="wide" title={`Transaction Settlement: ${d.type} ${d.txn}`} eyebrow="MO settlement" subtitle="Bank details of the FX leg"
      status={<TrafficLightTag tone={d.settled ? 'green' : 'amber'}>{d.settled ? 'Settled' : 'Open'}</TrafficLightTag>} onClose={onClose}
      footerStart={<button className="button secondary" onClick={onPrint}>Print Letters</button>}
      footer={<>
        <button className="button secondary" onClick={onClose}>Cancel</button>
        <button className="button secondary" onClick={() => onUpdate(d)}>Update</button>
        <button className="button" style={{ background: '#24a481', borderColor: '#24a481' }} onClick={settle}>Settlement Complete</button>
      </>}>
      <DialogSection title="Basic Details">
        <Facts items={[['Company Code', d.coCode], ['Sequence', d.seq], ['Transaction', d.txn], ['Deal Type', d.type === 'D1' ? 'D1 - Buy/Sell leg 1' : 'D2 - Buy/Sell leg 2'], ['Partner', d.partner]]} />
      </DialogSection>
      <DialogSection title="Buy Currency">
        <Facts items={[['Buy Amount', `${amt(buy.amount)} ${buy.cur}`], ['FI Document', 'posted by BO (ZSGTSFR081)'], ['Bank Type', [d.bankType, BANK_TYPES[d.bankType]].filter(Boolean).join(' - ')], ['Transfer Type', [d.transferType, TRANSFER_TYPES[d.transferType]].filter(Boolean).join(' - ')]]} />
        <BankFields side={d.buy} set={s => setD({ ...d, buy: s })} />
      </DialogSection>
      <DialogSection title="Sell Currency">
        <Facts items={[['Sell Amount', `${amt(sell.amount)} ${sell.cur}`], ['FI Document', 'posted by BO (ZSGTSFR081)'], ['Bank Type', [d.bankType, BANK_TYPES[d.bankType]].filter(Boolean).join(' - ')], ['Transfer Type', [d.transferType, TRANSFER_TYPES[d.transferType]].filter(Boolean).join(' - ')]]} />
        <label className="tsf-check-row"><input type="checkbox" checked={d.remit} onChange={e => setD({ ...d, remit: e.target.checked })} /> I will Remit to You</label>
        <BankFields side={d.sell} set={s => setD({ ...d, sell: s })} remitLock={d.remit} />
      </DialogSection>
    </Modal>
  );
}

export function InvModal({ leg, dealId, onClose, onUpdate, onSettle }: {
  leg: InvLeg; dealId: string; onClose: () => void; onUpdate: (d: InvLeg) => void; onSettle: (d: InvLeg) => Promise<boolean>;
}) {
  const [d, setD] = useState<InvLeg>(leg);
  const receipt = recPay(d) === 'Receipt';
  const settle = () => { void onSettle(d).then(ok => { if (ok) onClose(); }); };
  const pair = (label: string, bank: keyof InvLeg, acc: keyof InvLeg, locked: boolean) => (
    <div className="tsf-fields">
      <label className="tsf-field">{label} House Bank
        <input value={String(d[bank])} maxLength={5} disabled={locked} onChange={e => setD({ ...d, [bank]: e.target.value.toUpperCase() })} />
      </label>
      <label className="tsf-field">{label} Account ID
        <input value={String(d[acc])} maxLength={5} disabled={locked} onChange={e => setD({ ...d, [acc]: e.target.value.toUpperCase() })} />
      </label>
    </div>
  );
  return (
    <Modal size="wide" title={`Trade Invoice Settlement: ${d.leg}`} eyebrow="MO settlement" subtitle={`Sequence ${d.seq}, Deal ID ${dealId}`}
      status={<TrafficLightTag tone={d.settled ? 'green' : 'amber'}>{d.settled ? 'Settled' : 'Open'}</TrafficLightTag>} onClose={onClose}
      footer={<>
        <button className="button secondary" onClick={onClose}>Cancel</button>
        <button className="button secondary" onClick={() => onUpdate(d)}>Update</button>
        <button className="button" style={{ background: '#24a481', borderColor: '#24a481' }} onClick={settle}>Settlement Complete</button>
      </>}>
      <DialogSection title="Basic Details">
        <Facts items={[['Company Code', d.coCode], ['Sequence', String(d.seq)], ['Leg', d.leg], ['Seller', d.seller], ['Buyer', d.buyer], ['Reference', d.ref], ['Value Date', date(d.due)],
          ['Invoice Amount', `${amt(d.invAmt)} ${d.invCur}`], ['FI Document No', d.fiDoc || 'posted by BO']]} />
      </DialogSection>
      <DialogSection title="Sender / Payer" description={receipt ? 'Receipt leg: sender and receiver are locked.' : undefined}>
        {pair('Sender', 'senderBank', 'senderAcc', receipt)}
      </DialogSection>
      <DialogSection title="Receiver / Payee">
        {pair('Receiver', 'receiverBank', 'receiverAcc', receipt)}
        <label className="tsf-field">Partner ID<input value={d.partnerId} maxLength={10} onChange={e => setD({ ...d, partnerId: e.target.value.toUpperCase() })} /></label>
      </DialogSection>
      <DialogSection title="Document Message">
        <label className="tsf-field">Doc Msg<textarea value={d.docMsg} onChange={e => setD({ ...d, docMsg: e.target.value })} /></label>
      </DialogSection>
    </Modal>
  );
}
