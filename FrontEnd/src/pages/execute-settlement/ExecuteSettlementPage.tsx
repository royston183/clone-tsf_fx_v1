import { useEffect, useMemo, useState } from 'react';
import type { CustomPageProps } from '@/pages/registry';
import { useSearchParams } from '@/lib/client/nav';
import { Modal } from '@/components/ui/Modal';
import { Toast, useToast } from '@/components/ui/Toast';
import { TrafficLightTag } from '@/components/ui/Badge';
import { Notice } from '@/components/ui/Notice';
import { txnStatusTone } from '@/pages/fx/sample';
import { amt, date, rate } from '@/pages/fx/format';
import { FxTable, type FxColumn } from '@/pages/fx/FxTable';
import '@/pages/fx/fx.css';
import './execute-settlement.css';
import { hasInvoice, recPay, type Deal, type DealPick, type FxLeg, type InvLeg } from './data';
import { amendEndDate, completeExecution, completeInvoiceLeg, initiateSettlement, saveDifference, updateInvoiceLeg, type ActionResult } from './actions';
import { errorText, loadDeal, loadDealList } from './live';
import { FX_BANK_WAITING, WAITING } from './logic';
import { AmendEndDateModal, DiffModal, HeadsUpModal, InvoiceViewModal, PnlModal, TxnModal, InvModal } from './Modals';

type Popup = 'amend' | 'heads' | 'diff' | 'pnl' | 'invoice' | 'picker' | null;
/** What one request for a Deal ID answered: its Deal ID, the Deal or the error. `n` counts reloads of the same Deal ID. */
type Answer = { id: string; n: number; deal?: Deal; error?: string };

const statusText = (deal: Deal, code: string) => deal.statuses.find(s => s.code === code)?.text ?? 'Unknown';
const statusTag = (deal: Deal) => {
  const n = Number(deal.status);
  const text = `${deal.status} - ${statusText(deal, deal.status)}`;
  return <TrafficLightTag tone={n >= 21 ? 'green' : 'amber'}>{n < 5 ? `${text} (early)` : text}</TrafficLightTag>;
};

export default function ExecuteSettlementPage({ node }: CustomPageProps) {
  void node;
  const params = useSearchParams();
  const [toast, notify] = useToast();
  const [list, setList] = useState<{ rows: DealPick[]; error: string } | null>(null);
  const [request, setRequest] = useState<{ id: string; n: number } | null>(() => {
    const id = (params.get('dealId') ?? '').trim().toUpperCase();
    return id ? { id, n: 0 } : null;
  });
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [input, setInput] = useState(() => (params.get('dealId') ?? '').toUpperCase());
  const [error, setError] = useState('');
  const [popup, setPopup] = useState<Popup>(null);
  const [fxOpen, setFxOpen] = useState<string | null>(null);
  const [invOpen, setInvOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The picker's Deal IDs are read once; a Deal ID's data whenever the request changes (state is set only after a read answers).
  useEffect(() => {
    let alive = true;
    loadDealList().then(rows => alive && setList({ rows, error: '' }), e => alive && setList({ rows: [], error: errorText(e) }));
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!request) return;
    let alive = true;
    loadDeal(request.id).then(deal => alive && setAnswer({ id: request.id, n: request.n, deal }), e => alive && setAnswer({ id: request.id, n: request.n, error: errorText(e) }));
    return () => { alive = false; };
  }, [request]);

  const loading = !!request && (answer?.id !== request.id || answer.n !== request.n);
  const shown = request && answer?.id === request.id ? answer : null;
  const deal = shown?.deal ?? null;
  const loadError = !loading && shown?.error ? shown.error : '';
  const picks = list?.rows ?? [];

  const load = (raw: string) => {
    const id = raw.trim().toUpperCase();
    if (!id) { setError('Please enter a Deal ID. (Deal ID is a mandatory field.)'); return; }
    setError(''); setInput(id); setRequest({ id, n: 0 }); setPopup(null); setFxOpen(null); setInvOpen(null);
  };
  const reload = () => setRequest(r => (r ? { id: r.id, n: r.n + 1 } : r));
  const exit = () => { setRequest(null); setAnswer(null); setInput(''); setError(''); setPopup(null); setFxOpen(null); setInvOpen(null); };

  /** Runs a write; on success the Deal ID is read again, so the screen shows what is stored. */
  const run = async (task: Promise<ActionResult>, success?: string): Promise<boolean> => {
    setBusy(true);
    const r = await task;
    setBusy(false);
    notify(r.ok ? (success ?? r.message) : r.error, r.ok ? 'success' : 'error');
    if (r.ok) reload();
    return r.ok;
  };

  const fxLeg = deal?.fx.find(l => l.key === fxOpen) ?? null;
  const invLeg = deal?.inv.find(l => l.leg === invOpen) ?? null;
  const settleInv = (d: InvLeg) => (deal && invLeg ? run(completeInvoiceLeg(deal, invLeg, d)) : Promise.resolve(false));
  const updateInv = (d: InvLeg) => { if (deal && invLeg) void run(updateInvoiceLeg(deal, invLeg, d)); };

  const fxCols: FxColumn<FxLeg>[] = useMemo(() => [
    { id: 'seq', label: 'Seq', kind: 'code', value: l => l.seq }, { id: 'co', label: 'CoCode', kind: 'code', value: l => l.coCode },
    { id: 'type', label: 'Deal Type', kind: 'status', value: l => l.type, render: l => <span className="tsf-chip">{l.type}</span> },
    { id: 'txn', label: 'Transaction', kind: 'code', value: l => l.txn }, { id: 'partner', label: 'Partner Name', value: l => l.partner },
    { id: 'td', label: 'Txn Date', kind: 'date', value: l => l.txnDate, render: l => date(l.txnDate) },
    { id: 'vd', label: 'Value Date', kind: 'date', value: l => l.valueDate, render: l => date(l.valueDate) },
    { id: 'bs1', label: 'B/S 1', value: l => l.bs1 }, { id: 'c1', label: 'Curr 1', kind: 'code', value: l => l.cur1 },
    { id: 'a1', label: 'Amount 1', kind: 'amount', value: l => l.amt1, render: l => amt(l.amt1) },
    { id: 'bs2', label: 'B/S 2', value: l => l.bs2 }, { id: 'c2', label: 'Curr 2', kind: 'code', value: l => l.cur2 },
    { id: 'a2', label: 'Amount 2', kind: 'amount', value: l => l.amt2, render: l => amt(l.amt2) },
    { id: 'spot', label: 'Spot', kind: 'rate', value: l => l.spot, render: l => rate(l.spot) },
    { id: 'rate', label: 'All-in Rate', kind: 'rate', value: l => l.rate, render: l => rate(l.rate) },
    { id: 'desc', label: 'Txn Type', value: l => l.typeDesc },
    { id: 'ts', label: 'Txn Status', value: l => `${l.txnStatus} - ${l.txnStatusText}` },
    { id: 'mc', label: 'MC Ref No', value: l => l.mc },
    { id: 'st', label: 'Status', kind: 'status', value: l => (l.settled ? 'Settled' : l.txnStatus),
      render: l => (l.settled ? <TrafficLightTag tone="green">Settled</TrafficLightTag> : <TrafficLightTag tone={txnStatusTone(l.txnStatus)}>{l.txnStatusText || l.txnStatus}</TrafficLightTag>) },
    { id: 'd1', label: 'Doc No 1', kind: 'code', value: l => l.doc1 }, { id: 'd2', label: 'Doc No 2', kind: 'code', value: l => l.doc2 }
  ], []);
  const invCols: FxColumn<InvLeg>[] = useMemo(() => [
    { id: 'seq', label: 'Sequence', kind: 'number', value: l => l.seq },
    { id: 'leg', label: 'Leg', kind: 'status', value: l => l.leg, render: l => <span className="tsf-chip">{l.leg}</span> },
    { id: 'co', label: 'CoCode', kind: 'code', value: l => l.coCode }, { id: 'sel', label: 'Seller', value: l => l.seller }, { id: 'buy', label: 'Buyer', value: l => l.buyer },
    { id: 'desc', label: 'Settlement Desc', value: l => l.desc }, { id: 'dt', label: 'Doc Type', kind: 'code', value: l => l.docType }, { id: 'ref', label: 'Reference', value: l => l.ref },
    { id: 'due', label: 'Due Date', kind: 'date', value: l => l.due, render: l => date(l.due) },
    { id: 'ia', label: 'Invoice Amt', kind: 'amount', value: l => l.invAmt, render: l => amt(l.invAmt) }, { id: 'ic', label: 'Inv Curr', kind: 'code', value: l => l.invCur },
    { id: 'pa', label: 'Payment Amt', kind: 'amount', value: l => l.payAmt, render: l => (l.payReason ? <span title={l.payReason}>—</span> : amt(l.payAmt)) }, { id: 'pc', label: 'Pay Curr', kind: 'code', value: l => l.payCur },
    { id: 'rp', label: 'Rec/Pay', value: l => recPay(l) }, { id: 'fx', label: 'FX Deal', kind: 'code', value: l => l.fxDeal },
    { id: 'tt', label: 'Transfer Type', value: l => l.transferType }, { id: 'fi', label: 'FI Doc', kind: 'code', value: l => l.fiDoc },
    { id: 'st', label: 'Settled', kind: 'status', value: l => (l.settled ? 'Yes' : 'No'), render: l => <TrafficLightTag tone={l.settled ? 'green' : 'amber'}>{l.settled ? 'Yes' : 'No'}</TrafficLightTag> }
  ], []);
  const pickCols: FxColumn<DealPick>[] = [
    { id: 'id', label: 'Deal ID', kind: 'code', value: d => d.id }, { id: 'm', label: 'FX Model', value: d => [d.model, d.modelText].filter(Boolean).join(' - ') },
    { id: 'e', label: 'Entity String', value: d => d.entity }, { id: 'desc', label: 'Description', value: d => d.desc },
    { id: 's', label: 'Status', kind: 'status', value: d => d.status, render: d => <TrafficLightTag tone={Number(d.status) >= 21 ? 'green' : 'amber'}>{d.status}</TrafficLightTag> }
  ];

  const num = deal ? Number(deal.status) : 0;
  const withInv = deal ? hasInvoice(deal) : false;
  const unreadable = deal?.notes ?? [];
  const sourceTone = loadError || list?.error ? 'red' : unreadable.length ? 'amber' : 'green';

  return (
    <div className="tsf-page tsf-settlement">
      <div className="tsf-head">
        <div>
          <h1>MO: Execute Settlement for Deal ID</h1>
          <p>Settle every FX and trade-invoice leg of one Deal ID</p>
        </div>
        <div className="tsf-head__meta">
          <span className="tsf-tcode">ZSGTSFR060</span>
          <TrafficLightTag tone={sourceTone}>SLC middleware · Deal ID, master contract, settlement</TrafficLightTag>
          <TrafficLightTag tone={sourceTone}>SAP · ZFS_SB_TSFDEAL_O4_API</TrafficLightTag>
          <button className="button secondary" onClick={() => notify(`${WAITING}: Initiate Printing.`)}>Initiate Printing</button>
          <button className="button secondary" onClick={() => notify('Deal ID documents open here.')}>DMS</button>
          <button className="button secondary" disabled={!request || loading} onClick={() => { reload(); notify('Screen refreshed.'); }}>Refresh</button>
          <button className="button secondary" onClick={exit}>Exit</button>
        </div>
      </div>

      <section className="panel tsf-card" aria-label="Basic Selection">
        <div className="tsf-card__head"><h2>Basic Selection</h2></div>
        <div className="tsf-toolbar">
          <label className="tsf-field tsf-sel-input">Deal ID
            <input value={input} maxLength={10} placeholder="ENTER DEAL ID..." list="tsf-settle-deals" aria-invalid={!!error}
              onChange={e => { setInput(e.target.value.toUpperCase()); setError(''); }} onKeyDown={e => { if (e.key === 'Enter') load(input); }} />
            <datalist id="tsf-settle-deals">{picks.map(d => <option key={d.id} value={d.id}>{d.status} - {d.desc}</option>)}</datalist>
          </label>
          <button className="button" disabled={loading} onClick={() => load(input)}>Execute</button>
          <button className="button secondary" onClick={() => setPopup('picker')}>View Deals</button>
        </div>
        {error && <div className="tsf-check bad" role="alert">{error}</div>}
        {list?.error && <Notice error>The Deal IDs could not be read: {list.error}</Notice>}
      </section>

      {!request && <Notice>Enter a Deal ID, or open View Deals, to load its settlement.</Notice>}
      {loading && !deal && <Notice>Loading Deal ID {request?.id}…</Notice>}
      {loadError && <Notice error action={{ label: 'Retry', onClick: reload }}>{loadError}</Notice>}

      {deal && <>
        {unreadable.map(n => <Notice key={n} kind="warn">{n}</Notice>)}
        <section className="panel tsf-card" aria-label="Deal ID Overview" aria-busy={loading || busy}>
          <div className="tsf-card__head"><h2>Deal ID Overview</h2>{statusTag(deal)}</div>
          <dl className="tsf-facts">
            {([['Deal ID', deal.id], ['Deal Start Date', date(deal.start)], ['Deal End Date', date(deal.end)], ['Revised End Date', date(deal.revised)], ['MC Ref No', deal.mc],
              ['MC Description', deal.mcDesc], ['MC Date', date(deal.mcDate)], ['Ship End Date', date(deal.shipEnd)], ['FX Model ID', deal.model], ['FX Model Desc', deal.modelText],
              ['Entity String', deal.entity], ['FX Inv Model', withInv ? 'Yes' : 'No'], ['Trader', deal.trader], ['Currency String', deal.currencies]] as [string, string][])
              .map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v || '—'}</dd></div>)}
            <div><dt id="tsf-set-status">Deal ID Status</dt>
              <dd><select aria-labelledby="tsf-set-status" value={deal.status} onChange={() => notify(`${WAITING}: the Deal ID status cannot be changed here.`)}>
                {(deal.statuses.some(s => s.code === deal.status) ? deal.statuses : [{ code: deal.status, text: 'Unknown' }, ...deal.statuses]).map(s => <option key={s.code} value={s.code}>{s.code} - {s.text}</option>)}</select></dd></div>
          </dl>
          <div className="tsf-actions">
            <button className="button secondary" disabled={busy} onClick={() => setPopup('amend')}>Amend End Date</button>
            <button className="button secondary" onClick={() => setPopup('heads')}>Headsup</button>
            <button className="button secondary" disabled={!withInv} onClick={() => setPopup('invoice')}>View Trade Invoice</button>
            <button className="button secondary" disabled={!withInv} onClick={() => setPopup('diff')}>FX-Invoice Difference</button>
            <button className="button secondary" onClick={() => setPopup('pnl')}>View P&amp;L</button>
            <button className="button secondary" onClick={() => notify('Deal ID documents open here.')}>Edit DMS</button>
            {num >= 5 && num <= 19 && <button className="button tsf-push" disabled={busy} onClick={() => void run(initiateSettlement(deal))}>Initiate Settlement</button>}
            {num === 20 && <button className="button tsf-push tsf-green" disabled={busy} onClick={() => void run(completeExecution(deal))}>Execution Complete</button>}
          </div>
          <p className="tsf-hint">Double-click a grid row to open its settlement screen.</p>
        </section>

        <section className="panel tsf-card" aria-label="FX Deal Settlement">
          <div className="tsf-card__head"><h2>FX Deal Settlement</h2><span className="tsf-count">{deal.fx.length} legs</span></div>
          <FxTable label="FX deal settlement" columns={fxCols} rows={deal.fx} rowKey={l => l.key} onOpen={l => setFxOpen(l.key)} empty="No FX transaction carries this Deal ID." />
          <p className="tsf-hint">Option legs (ZSGTSFCDS_OPTION) have no service yet; only the FX legs are shown. The settled flag and bank fields come from TrmFxApp.</p>
        </section>

        {withInv && <section className="panel tsf-card" aria-label="Trade Invoice Settlement">
          <div className="tsf-card__head"><h2>Trade Invoice Settlement</h2><span className="tsf-count">{deal.inv.filter(l => l.settled).length} of {deal.inv.length} settled</span></div>
          <FxTable label="Trade invoice settlement" columns={invCols} rows={deal.inv} rowKey={l => l.leg} onOpen={l => setInvOpen(l.leg)} empty="ZSGTSFTR_SET_TYP has no leg for this Deal ID's model." />
        </section>}
      </>}

      {popup === 'picker' && (
        <Modal size="wide" title="View Deals" subtitle="Click a deal row to load it." onClose={() => setPopup(null)} footer={<button className="button secondary" onClick={() => setPopup(null)}>Close</button>}>
          <FxTable label="Deal IDs" columns={pickCols} rows={picks} rowKey={d => d.id} select="single" picked={[]} onPick={k => k[0] && load(k[0])} empty={list ? 'No deals.' : 'Loading…'} />
        </Modal>
      )}
      {deal && popup === 'amend' && <AmendEndDateModal current={deal.revised || deal.end} onClose={() => setPopup(null)}
        onUpdate={iso => { setPopup(null); void run(amendEndDate(deal, iso), `Deal end date amended to ${date(iso)}.`); }} />}
      {deal && popup === 'heads' && <HeadsUpModal deal={deal} onClose={() => setPopup(null)} />}
      {deal && popup === 'diff' && <DiffModal deal={deal} busy={busy} onClose={() => setPopup(null)} onSave={() => void run(saveDifference(deal))} />}
      {deal && popup === 'pnl' && <PnlModal deal={deal} onClose={() => setPopup(null)} />}
      {deal && popup === 'invoice' && <InvoiceViewModal deal={deal} onClose={() => setPopup(null)} />}
      {fxLeg && <TxnModal key={fxLeg.key} leg={fxLeg} onClose={() => setFxOpen(null)} onPrint={() => notify(`${WAITING}: Print Letters.`)}
        onUpdate={() => notify(FX_BANK_WAITING)} onSettle={() => { notify(FX_BANK_WAITING); return false; }} />}
      {deal && invLeg && <InvModal key={invLeg.leg} leg={invLeg} dealId={deal.id} onClose={() => setInvOpen(null)} onUpdate={updateInv} onSettle={settleInv} />}
      <Toast toast={toast} />
    </div>
  );
}
