// The Deal popup: summary, the transactions of the deal and its action items, with the settlement actions.
import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { TrafficLightTag } from '@/components/ui/Badge';
import { FxTable, type FxColumn } from '@/pages/fx/FxTable';
import { amt, date, rate } from '@/pages/fx/format';
import { ACTION_LABEL, actionOf, dealTone, isOption, isPending, txnTone, type ActionKind, type Deal, type Txn } from './data';
import { CreateSpotModal, NdfModal, SettlementSpotModal, UpdateRateModal } from './Popups';

type Popup = { kind: 'rate' | 'spot' | 'ndf' | 'diff'; txnId: string } | null;

const TXN_COLS: FxColumn<Txn>[] = [
  { id: 'co', label: 'Co. Code', kind: 'code', value: r => r.co },
  { id: 'dt', label: 'Deal Type', kind: 'code', value: r => r.dealType },
  { id: 'txn', label: 'Transaction', kind: 'code', value: r => r.id },
  { id: 'tt', label: 'Txn Type', kind: 'code', value: r => r.txnType },
  { id: 'bp', label: 'Partner Name', value: r => r.partner },
  { id: 'td', label: 'Trade Date', kind: 'date', value: r => r.trade, render: r => date(r.trade) },
  { id: 'vd', label: 'Value Date', kind: 'date', value: r => r.value, render: r => date(r.value) },
  { id: 'b1', label: 'B/S 1', value: r => r.bs1 },
  { id: 'c1', label: 'Curr 1', kind: 'code', value: r => r.cur1 },
  { id: 'a1', label: 'Amount 1', kind: 'amount', value: r => r.amt1, render: r => amt(r.amt1) },
  { id: 'b2', label: 'B/S 2', value: r => r.bs2 },
  { id: 'c2', label: 'Curr 2', kind: 'code', value: r => r.cur2 },
  { id: 'a2', label: 'Amount 2', kind: 'amount', value: r => r.amt2, render: r => amt(r.amt2) },
  { id: 'sp', label: 'Spot', kind: 'rate', value: r => r.spot, render: r => rate(r.spot) },
  { id: 'st', label: 'Strike', kind: 'rate', value: r => r.strike, render: r => rate(r.strike) },
  { id: 'ai', label: 'All in Rate', kind: 'rate', value: r => r.allIn, render: r => rate(r.allIn) },
  { id: 'ts', label: 'Txn Status', kind: 'status', value: r => r.status, render: r => <TrafficLightTag tone={txnTone(r.status)}>{r.status} · {r.statusText || r.status}</TrafficLightTag> },
  { id: 'nd', label: 'NDF Fix Date', kind: 'date', value: r => r.ndfFixDate, render: r => date(r.ndfFixDate) },
  { id: 'nr', label: 'NDF Rate', kind: 'rate', value: r => r.ndfRate, render: r => rate(r.ndfRate) },
  { id: 'sc', label: 'Sett Complete', value: r => (r.settled ? 'Yes' : ''), render: r => (r.settled ? <TrafficLightTag tone="green">Yes</TrafficLightTag> : '') }
];

export function DealModal({ deal, txns, today, diffSpots, statusText, notSaved, onClose, onTxn, onDiffSpot, notify }: {
  deal: Deal; txns: Txn[]; today: string; diffSpots: string[]; statusText: (code: string) => string; notSaved: string; onClose: () => void;
  onTxn: (id: string, patch: Partial<Txn>) => void; onDiffSpot: (id: string) => void; notify: (text: string, kind?: 'info' | 'success' | 'error') => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [popup, setPopup] = useState<Popup>(null);
  const [ask, setAsk] = useState<string | null>(null);
  const sel = txns.find(t => t.id === picked[0]);
  const forTxn = (id: string | undefined) => txns.find(t => t.id === id);

  const blocked = (kind: 'rate' | 'ndf' | 'diff'): string | null => {
    if (!sel) return null;
    if (kind === 'rate') return !isOption(sel) ? 'Option Exercise/Expire needs an option transaction.' : !isPending(sel) ? 'This option is already updated.' : null;
    if (kind === 'ndf') return actionOf(sel) !== 'ndf' ? 'NDF Rate Fixing needs an NDF transaction (631 or 632).' : Number(sel.status) >= 10 ? 'This NDF is already fixed.' : null;
    return sel.invoiceAmt === null ? 'Diff Spot needs an invoiced transaction.' : null;
  };
  const run = (kind: 'rate' | 'ndf' | 'diff') => {
    if (!sel) { notify('Select a transaction first.', 'error'); return; }
    if (blocked(kind)) return;
    setPopup({ kind: kind === 'diff' ? 'diff' : kind, txnId: sel.id });
  };
  const create = (t: Txn) => {
    const k: ActionKind | null = actionOf(t);
    if (k === 'spot') setPopup({ kind: 'diff', txnId: t.id });
    else if (k === 'ndf') setPopup({ kind: 'ndf', txnId: t.id });
    else if (k === 'rate') setPopup({ kind: 'rate', txnId: t.id });
  };

  const actionCols: FxColumn<Txn>[] = [
    { id: 'txn', label: 'Transaction', kind: 'code', value: r => r.id },
    { id: 'dt', label: 'Deal Type', kind: 'code', value: r => r.dealType },
    { id: 'ai', label: 'Action Item', kind: 'status', value: r => (isPending(r) ? 'Pending' : 'Done'), render: r => (isPending(r) ? <TrafficLightTag tone="amber">Pending · {r.actionText || ACTION_LABEL[actionOf(r) ?? 'spot']}</TrafficLightTag> : <TrafficLightTag tone="green">Done</TrafficLightTag>) },
    { id: 'cr', label: 'Create', kind: 'actions', value: () => '', render: r => (isPending(r) && actionOf(r) ? <button className="button small" onClick={e => { e.stopPropagation(); create(r); }}>Create</button> : null) },
    { id: 'co', label: 'Co. Code', kind: 'code', value: r => r.co },
    { id: 'cp', label: 'Counterparty', value: r => r.partner },
    { id: 'tt', label: 'Txn Type', kind: 'code', value: r => r.txnType },
    { id: 'ts', label: 'Txn Status', kind: 'status', value: r => r.status, render: r => <TrafficLightTag tone={txnTone(r.status)}>{r.statusText || r.status}</TrafficLightTag> },
    { id: 'vd', label: 'Value Date', kind: 'date', value: r => r.value, render: r => date(r.value) },
    { id: 'ia', label: 'Invoice Amt', kind: 'amount', value: r => r.invoiceAmt, render: r => amt(r.invoiceAmt) },
    { id: 'id', label: 'Invoice Diff', kind: 'amount', value: r => r.invoiceDiff, render: r => amt(r.invoiceDiff) }
  ];

  const target = forTxn(popup?.txnId);
  const why = (['rate', 'ndf', 'diff'] as const).map(k => blocked(k)).filter(Boolean);
  const btn = (kind: 'rate' | 'ndf' | 'diff', label: string) => (
    <button className="button secondary" disabled={!!blocked(kind)} title={blocked(kind) ?? undefined} onClick={() => run(kind)}>{label}</button>
  );

  return (
    <Modal title={`Deal ${deal.id}`} subtitle="Transactions and action items of the Deal ID" eyebrow="Deal" size="wide" status={<TrafficLightTag tone={dealTone(deal)}>{statusText(deal.status)}</TrafficLightTag>}
      onClose={onClose} footer={<button className="button secondary" onClick={onClose}>Close</button>}>
      <div className="tsf-wb-stack">
        <dl className="tsf-facts">
          <div><dt>Description</dt><dd>{deal.desc}</dd></div><div><dt>Model</dt><dd>{deal.model}</dd></div>
          <div><dt>Status</dt><dd>{deal.status} · {statusText(deal.status)}</dd></div><div><dt>MC Reference</dt><dd>{deal.mc}</dd></div>
          <div><dt>Settlement Window</dt><dd>{date(deal.start)} to {date(deal.end)}</dd></div><div><dt>Type</dt><dd>{deal.type} · {deal.subType}</dd></div>
        </dl>
        <div className="tsf-toolbar">
          {btn('rate', 'Option Exercise/Expire')}{btn('ndf', 'NDF Rate Fixing')}{btn('diff', 'Diff Spot')}
          {sel && why.length > 0 && <span className="tsf-wb-why" role="status">{why.join(' ')}</span>}
          {!sel && <span className="tsf-wb-why">Select a transaction to enable its actions.</span>}
        </div>
        <h3 className="tsf-wb-h">Transactions</h3>
        <FxTable label="Transactions" columns={TXN_COLS} rows={txns} rowKey={r => r.id} select="single" picked={picked} onPick={setPicked} empty="No transactions for this Deal ID." pageSizes={[10, 20]} />
        <h3 className="tsf-wb-h">Action Items</h3>
        <FxTable label="Action items" columns={actionCols} rows={txns.filter(t => actionOf(t))} rowKey={r => r.id} empty="No action items." pageSizes={[10, 20]} />
      </div>

      {popup?.kind === 'rate' && target && <UpdateRateModal txn={target} onClose={() => setPopup(null)} onUpdated={(outcome, r) => {
        onTxn(target.id, { status: outcome === 'exercise' ? '24' : '34', spot: r });
        setPopup(null);
        notify(`${outcome === 'exercise' ? 'Exercise' : 'Expire'} not saved. ${notSaved}`, 'info');
        setAsk(target.id);
      }} />}
      {popup?.kind === 'spot' && target && <CreateSpotModal txn={target} today={today} onClose={() => setPopup(null)} onCreated={n => { onTxn(target.id, { hasSpot: true }); setPopup(null); notify(`Spot ${n} not created. ${notSaved}`, 'info'); }} />}
      {popup?.kind === 'ndf' && target && <NdfModal txn={target} onClose={() => setPopup(null)} onSent={r => {
        onTxn(target.id, { status: '10', ndfRate: r }); setPopup(null); notify(`NDF fixing not sent. ${notSaved}`, 'info'); setAsk(target.id);
      }} />}
      {popup?.kind === 'diff' && target && <SettlementSpotModal deal={deal} txn={target} today={today} created={diffSpots.includes(target.id)} onClose={() => setPopup(null)}
        onCreated={n => { onDiffSpot(target.id); onTxn(target.id, { hasSpot: true }); setPopup(null); notify(`Spot ${n} not created. ${notSaved}`, 'info'); }} />}
      {ask && <ConfirmDialog title="Create Spot?" message={`Do you want to create the Spot? ${notSaved}`} confirmLabel="Yes" onClose={() => setAsk(null)}
        onConfirm={() => { const id = ask; setAsk(null); setPopup({ kind: 'spot', txnId: id }); }} />}
    </Modal>
  );
}
