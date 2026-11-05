// TSF MO Deal Confirmation - FX & Options (ZSGTSFR024): the Mid Office queue of FX deals FO released. MO matches and
// releases them (SAP settles the transaction, status 07) or returns them to FO (04 Correction Required).
// Live: the queue is the tsf-deals report (ZFS_SB_TSFDEAL_O4_API); the writes are in workflow.ts.
import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Filter, RefreshCw, Search } from 'lucide-react';
import { SelectionPanel } from '@/components/report/SelectionPanel';
import { TrafficLightTag } from '@/components/ui/Badge';
import { DialogSection } from '@/components/ui/DialogSection';
import { Modal } from '@/components/ui/Modal';
import { Toast, useToast } from '@/components/ui/Toast';
import type { CustomPageProps } from '@/pages/registry';
import { FxTable, type FxColumn } from '../fx/FxTable';
import { amt, date, isoToday, rate } from '../fx/format';
import { CONF_COMPANIES, CONF_STATUS, CONF_TRADERS, confTone, type ConfDeal } from './data';
import { loadQueue, OPTIONS_EMPTY } from './live';
import { MO_REMARK_MAX, matchAndReleaseDeals, requestCorrectionDeals, type MoBatch } from './workflow';
import '../fx/fx.css';
import './deal-confirmation.css';

interface Selection { from: string; to: string; upto: string; trader: string; display: 'FX' | 'Options' }
interface Filters { company: string; type: string; partner: string; trader: string; curr1: string; curr2: string; status: string }
const NO_FILTERS: Filters = { company: '', type: '', partner: '', trader: '', curr1: '', curr2: '', status: '' };
interface Result { title: string; text: string; ok: boolean }

const why = (d: ConfDeal) => d.status === '04' ? 'it is already with FO for correction and comes back to MO once FO has corrected it'
  : d.status === '07' ? 'it has already been matched and released' : d.status === '59' ? 'it is an offset transaction and is already complete' : '';

export default function DealConfirmationPage(props: CustomPageProps) {
  void props; // the page needs no catalogue context
  const [today] = useState(() => isoToday());
  const [rows, setRows] = useState<ConfDeal[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [warning, setWarning] = useState('');
  const [busy, setBusy] = useState(false);
  const latest = useRef(0);
  const [sel, setSel] = useState<Selection>({ from: '', to: '', upto: today, trader: '', display: 'FX' });
  const [applied, setApplied] = useState<Selection | null>(null);
  const [selError, setSelError] = useState('');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [picked, setPicked] = useState<string[]>([]);
  const [dialog, setDialog] = useState<'match' | 'correct' | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [toast, notify] = useToast();

  // The rows are read for the applied selection (status 03, 04 and 06, blotter date up to the chosen day); Options have no SAP service.
  const queue = useMemo(() => (applied?.display === 'FX' ? rows.filter(r => r.status !== '07' && r.status !== '59') : []), [rows, applied]);
  const options = useMemo(() => {
    const uniq = (f: (r: ConfDeal) => string) => [...new Set(queue.map(f))].sort();
    return { company: uniq(r => r.companyCode), type: uniq(r => r.txnType), partner: uniq(r => r.partner), trader: uniq(r => r.trader), curr1: uniq(r => r.curr1), curr2: uniq(r => r.curr2), status: uniq(r => r.status) };
  }, [queue]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return queue.filter(r => (!filters.company || r.companyCode === filters.company) && (!filters.type || r.txnType === filters.type)
      && (!filters.partner || r.partner === filters.partner) && (!filters.trader || r.trader === filters.trader)
      && (!filters.curr1 || r.curr1 === filters.curr1) && (!filters.curr2 || r.curr2 === filters.curr2) && (!filters.status || r.status === filters.status)
      && (!q || [r.dealId, r.transaction, r.partner, r.trader, CONF_STATUS[r.status], r.companyCode].some(v => v.toLowerCase().includes(q))));
  }, [queue, filters, search]);
  const chosen = rows.filter(r => picked.includes(r.key));

  /** Reads the queue of a selection from SAP; a later call (or a reset) makes an earlier answer obsolete. Resolves true when it loaded. */
  const load = async (s: Selection): Promise<boolean> => {
    const mine = ++latest.current;
    setLoadError(''); setWarning('');
    if (s.display === 'Options') { setRows([]); setLoading(false); return true; }
    setLoading(true);
    try {
      const q = await loadQueue(s);
      if (mine !== latest.current) return false;
      setRows(q.deals); setWarning(q.warning);
      return true;
    } catch (e) {
      if (mine !== latest.current) return false;
      setRows([]); setLoadError(e instanceof Error ? e.message : 'The deals could not be read.');
      return false;
    } finally {
      if (mine === latest.current) setLoading(false);
    }
  };
  const view = () => {
    if (!sel.upto) { setSelError('Upto Blotter Date is required.'); return; }
    setSelError(''); setApplied(sel); setPicked([]); setFilters(NO_FILTERS);
    void load(sel);
  };
  const reset = () => {
    latest.current++;
    setSel({ from: '', to: '', upto: today, trader: '', display: 'FX' }); setApplied(null); setSelError(''); setPicked([]); setSearch('');
    setRows([]); setLoading(false); setLoadError(''); setWarning('');
  };
  const refresh = async () => { if (applied && await load(applied)) { setPicked([]); notify('Deals refreshed.', 'success'); } };
  const open = (kind: 'match' | 'correct') => {
    const blocked = chosen.find(d => why(d));
    if (blocked) { setResult({ title: 'Not allowed', text: `Deal ${blocked.dealId} cannot be processed: ${why(blocked)}.`, ok: false }); return; }
    setDialog(kind);
  };
  /** Runs the MO action on the chosen deals (one at a time, stopping at the first failure), reports it and reads the queue again. */
  const finish = async (kind: 'match' | 'correct', values: { extRef?: string; intRef?: string; moRemark: string }) => {
    if (busy) return;
    const deals = chosen, n = deals.length;
    setBusy(true);
    let batch: MoBatch;
    try {
      batch = kind === 'match'
        ? await matchAndReleaseDeals(deals, { extRef: values.extRef ?? '', intRef: values.intRef ?? '', moRemark: values.moRemark })
        : await requestCorrectionDeals(deals, values.moRemark);
    } catch (e) {
      batch = { done: [], failed: { dealId: deals[0]?.dealId ?? '', stage: 'workflow', reason: e instanceof Error ? e.message : 'The action failed.' } };
    }
    setBusy(false); setDialog(null); setPicked([]);
    const { failed, done } = batch;
    if (failed) {
      const cause = failed.stage === 'settle' ? `SAP could not settle deal ${failed.dealId}: ${failed.reason}` : failed.reason;
      const before = done.length ? `${done.length} of ${n} deals ${kind === 'match' ? 'matched and released' : 'sent back to FO'} before it stopped. ` : '';
      setResult({ title: kind === 'match' ? 'Match & Release stopped' : 'Correction Required stopped', text: `${before}${cause}`, ok: false });
    } else if (kind === 'match') {
      setResult({ title: 'Matched & Released', text: n === 1 ? `Deal ${deals[0].dealId} matched and released successfully.` : `${n} deals matched and released successfully.`, ok: true });
    } else {
      setResult({ title: 'Correction Requested', text: n === 1 ? `Deal ${deals[0].dealId} was sent back to FO for correction.` : `${n} deals were sent back to FO for correction.`, ok: true });
    }
    if (applied) void load(applied);
  };

  const columns: FxColumn<ConfDeal>[] = [
    { id: 'dealId', label: 'Deal ID', kind: 'code', value: r => r.dealId },
    { id: 'companyCode', label: 'CoCode', kind: 'code', value: r => r.companyCode },
    { id: 'transaction', label: 'Transaction', kind: 'code', value: r => r.transaction },
    { id: 'partner', label: 'Partner Name', value: r => r.partner },
    { id: 'txnType', label: 'Transaction Type Description', value: r => r.txnType, sortable: false },
    { id: 'tradeDate', label: 'Trade Date', kind: 'date', value: r => r.tradeDate, render: r => date(r.tradeDate) },
    { id: 'bs1', label: 'Buy/Sell 1', value: r => r.bs1, sortable: false },
    { id: 'curr1', label: 'Currency 1', kind: 'code', value: r => r.curr1 },
    { id: 'amount1', label: 'Amount 1', kind: 'amount', value: r => r.amount1, render: r => `${amt(r.amount1)}${r.bs1 === 'Sell' ? '-' : ''}` },
    { id: 'bs2', label: 'Buy/Sell 2', value: r => (r.bs1 === 'Buy' ? 'Sell' : 'Buy'), sortable: false },
    { id: 'curr2', label: 'Currency 2', kind: 'code', value: r => r.curr2, sortable: false },
    { id: 'amount2', label: 'Amount 2', kind: 'amount', value: r => r.amount2, render: r => `${amt(r.amount2)}${r.bs1 === 'Buy' ? '-' : ''}`, sortable: false },
    { id: 'fixingDate', label: 'Fixing Date', kind: 'date', value: r => r.fixingDate, render: r => date(r.fixingDate) },
    { id: 'valueDate', label: 'Value Date', kind: 'date', value: r => r.valueDate, render: r => date(r.valueDate) },
    { id: 'rate', label: 'All in Rate', kind: 'rate', value: r => r.rate, render: r => rate(r.rate), sortable: false },
    { id: 'status', label: 'Txn Status Desc', kind: 'status', value: r => CONF_STATUS[r.status], render: r => <TrafficLightTag tone={confTone(r.status)}>{CONF_STATUS[r.status]}</TrafficLightTag> },
    { id: 'trader', label: 'Trader Name', value: r => r.trader },
    { id: 'group', label: 'Group Description', value: r => r.group, sortable: false },
    { id: 'company', label: 'Company Name', value: r => CONF_COMPANIES.find(c => c.code === r.companyCode)?.text ?? '', sortable: false },
    { id: 'pc', label: 'Profit Center Description', value: r => r.profitCenter, sortable: false },
    { id: 'ba', label: 'Business Area Description', value: r => r.businessArea, sortable: false },
    { id: 'ndfRate', label: 'NDF Settlement Rate', kind: 'rate', value: r => r.ndfRate, render: r => (r.ndfRate ? rate(r.ndfRate) : '—'), sortable: false },
    { id: 'cash', label: 'Cash Settlement Amount', kind: 'amount', value: r => r.cashAmount, render: r => (r.cashAmount ? amt(r.cashAmount) : '—'), sortable: false },
    { id: 'cashCurr', label: 'Cash Currency', kind: 'code', value: r => r.cashCurr, sortable: false },
    { id: 'foRemark', label: 'FO Remark', value: r => r.foRemark || '—', sortable: false },
    { id: 'moRemark', label: 'MO Remark', value: r => r.moRemark || '—', sortable: false }
  ];
  const summary = applied
    ? `${applied.from || 'All companies'}${applied.to ? ` to ${applied.to}` : ''} · up to ${date(applied.upto)} · ${applied.trader || 'all traders'} · ${applied.display}`
    : 'Choose Company Code, Upto Blotter Date and Display Type to load deals.';
  const set = (f: keyof Filters, v: string) => setFilters(x => ({ ...x, [f]: v }));

  return (
    <div className="tsf-page tsf-confirm">
      <header className="tsf-head">
        <div><h1>TSF MO Deal Confirmation - FX &amp; Options</h1><p>Match and release the FX and option deals the Front Office released, or return them for correction.</p></div>
        <div className="tsf-head__meta"><span className="tsf-tcode">ZSGTSFR024</span><TrafficLightTag tone="green">SAP · ZFS_SB_TSFDEAL_O4_API</TrafficLightTag></div>
      </header>

      <SelectionPanel summary={summary}>
        <div className="tsf-fields">
          <label>Company Code (from)
            <select value={sel.from} onChange={e => setSel(s => ({ ...s, from: e.target.value }))}><option value="">All companies</option>{CONF_COMPANIES.map(c => <option key={c.code} value={c.code}>{c.code} - {c.text}</option>)}</select>
          </label>
          <label>Company Code (to)
            <select value={sel.to} onChange={e => setSel(s => ({ ...s, to: e.target.value }))}><option value="">—</option>{CONF_COMPANIES.map(c => <option key={c.code} value={c.code}>{c.code} - {c.text}</option>)}</select>
          </label>
          <label>Upto Blotter Date *
            <input type="date" value={sel.upto} aria-invalid={Boolean(selError)} onChange={e => setSel(s => ({ ...s, upto: e.target.value }))} />
            {selError && <span className="tsf-err">{selError}</span>}
          </label>
          <label>Trader Name
            <select value={sel.trader} onChange={e => setSel(s => ({ ...s, trader: e.target.value }))}><option value="">All traders</option>{CONF_TRADERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
          </label>
          <fieldset className="tsf-confirm__display"><legend>Display Type</legend>
            {(['FX', 'Options'] as const).map(d => <label key={d}><input type="radio" name="display" checked={sel.display === d} onChange={() => setSel(s => ({ ...s, display: d }))} />{d}</label>)}
          </fieldset>
          <div className="tsf-actions"><button className="button" onClick={view}>View Deals</button><button className="button secondary" onClick={reset}>Reset</button></div>
        </div>
      </SelectionPanel>

      {!applied ? (
        <section className="panel empty"><Search size={26} /><h2>Enter selection criteria to begin</h2><p>Choose Company Code, Upto Blotter Date and Display Type to load deals.</p></section>
      ) : applied.display === 'Options' ? (
        <section className="panel empty" aria-label="Option deals"><Search size={26} /><h2>No SAP service for option deals yet</h2><p>{OPTIONS_EMPTY}</p></section>
      ) : (
        <section className="panel tsf-card" aria-label="Deals for confirmation" aria-busy={loading}>
          <div className="tsf-toolbar">
            <label className="search"><Search size={15} /><input aria-label="Search deals" placeholder="Search Deal ID, Transaction, Bank, Trader, Status..." value={search} onChange={e => setSearch(e.target.value)} /></label>
            <button className="button secondary small" aria-expanded={showFilters} onClick={() => setShowFilters(v => !v)}><Filter size={14} />Filters<ChevronDown size={13} className={showFilters ? 'kit-chevron-open' : ''} /></button>
            <span className="tsf-count">{shown.length === 1 ? '1 deal' : `${shown.length} deals`}{picked.length ? ` · ${picked.length} selected` : ''}</span>
          </div>
          {showFilters && <div className="tsf-fields tsf-confirm__filters">
            {([['company', 'Company Code'], ['type', 'Transaction Type'], ['partner', 'Partner / Bank'], ['trader', 'Trader'], ['curr1', 'Currency 1'], ['curr2', 'Currency 2'], ['status', 'Transaction Status']] as [keyof Filters, string][]).map(([f, l]) => (
              <label key={f}>{l}<select value={filters[f]} onChange={e => set(f, e.target.value)}><option value="">All</option>{options[f].map(v => <option key={v} value={v}>{f === 'status' ? `${v} - ${CONF_STATUS[v]}` : v}</option>)}</select></label>
            ))}
            <div className="tsf-actions"><button className="button secondary small" onClick={() => setFilters(NO_FILTERS)}>Clear Filters</button></div>
          </div>}
          <div className="tsf-actions">
            <button className="button secondary" disabled={!picked.length} onClick={() => open('match')}><CheckCircle2 size={15} />Match &amp; Release</button>
            <button className="button danger" disabled={!picked.length} onClick={() => open('correct')}><AlertTriangle size={15} />Correction Required</button>
            <button className="button secondary small tsf-push" disabled={loading || busy} onClick={() => void refresh()}><RefreshCw size={14} />Refresh</button>
          </div>
          {loadError && <div className="tsf-check bad" role="alert">{loadError}</div>}
          {warning && <div className="tsf-check warn" role="status">{warning}</div>}
          {loading ? <p className="tsf-count" role="status">Loading deals from SAP…</p> : !loadError && (
            <FxTable label="FX deals for confirmation" columns={columns} rows={shown} rowKey={r => r.key} select="multi" picked={picked} onPick={setPicked}
              pageSizes={[20, 10, 25, 50]} empty={<><h2>No deals found</h2><p>No FX deals match the selected criteria.</p></>} />
          )}
        </section>
      )}

      {dialog === 'match' && <MatchDialog deals={chosen} busy={busy} onClose={() => setDialog(null)} onConfirm={v => void finish('match', v)} />}
      {dialog === 'correct' && <CorrectionDialog deals={chosen} busy={busy} onClose={() => setDialog(null)} onConfirm={moRemark => void finish('correct', { moRemark })} />}
      {result && <Modal title={result.title} size="small" onClose={() => setResult(null)} footer={<button className="button" onClick={() => setResult(null)}>OK</button>}>
        <div className={`tsf-check${result.ok ? '' : ' bad'}`} role="status">{result.text}</div>
      </Modal>}
      <Toast toast={toast} />
    </div>
  );
}

function DealCard({ d, open }: { d: ConfDeal; open: boolean }) {
  const facts: [string, string][] = [
    ['Transaction / Cover No', d.transaction], ['Deal ID', d.dealId], ['Company', d.companyCode], ['Currency Pair', `${d.curr1}/${d.curr2}`], ['Product Type', d.product],
    ['Transaction Type', d.txnType], ['Bank / Counterparty', d.partner], ['Notional Amount 1', `${amt(d.amount1)} ${d.curr1}`], ['Notional Amount 2', `${amt(d.amount2)} ${d.curr2}`],
    ['Buy / Sell', d.bs1], ['FX Deal Rate', rate(d.rate)], ['Trade Date', date(d.tradeDate)], ['Maturity Date', date(d.valueDate)], ['Current Status', CONF_STATUS[d.status]], ['FO Remarks', d.foRemark || '—']
  ];
  return (
    <details className="tsf-confirm__deal" open={open}>
      <summary>{d.curr1} / {d.curr2} · {d.display} · {d.transaction}</summary>
      <dl className="tsf-facts">{facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    </details>
  );
}

function MatchDialog({ deals, busy, onClose, onConfirm }: { deals: ConfDeal[]; busy: boolean; onClose: () => void; onConfirm: (v: { extRef: string; intRef: string; moRemark: string }) => void }) {
  const same = (f: (d: ConfDeal) => string) => (deals.every(d => f(d) === f(deals[0])) ? f(deals[0]) : '');
  const [extRef, setExtRef] = useState(() => same(d => d.extRef));
  const [intRef, setIntRef] = useState(() => same(d => d.intRef));
  const [moRemark, setMoRemark] = useState('');
  const [error, setError] = useState('');
  const over = deals.find(d => d.overLimit);
  const confirm = () => {
    if (busy) return;
    if (extRef.length > 16 || intRef.length > 15) { setError('External Ref must be at most 16 characters and Internal Ref at most 15 characters.'); return; }
    onConfirm({ extRef, intRef, moRemark });
  };
  const n = deals.length;
  return (
    <Modal eyebrow="FX & Options Deal Confirmation" title={n === 1 ? 'Confirm Deal' : 'Confirm Deals'} size="wide" onClose={onClose} onPrimary={confirm}
      subtitle={n === 1 ? 'Review the transaction details before matching and releasing.' : `Review all ${n} selected deals before matching and releasing.`}
      footer={<><button className="button secondary" onClick={onClose}>Cancel</button><button className="button" disabled={busy} onClick={confirm}>{busy ? 'Working…' : n === 1 ? 'Confirm Deal' : `Confirm ${n} Deals`}</button></>}>
      {over && <div className="tsf-check warn">Limit management: Deal ID {over.dealId} is over its utilisation limit. This is a warning only; you can still continue.</div>}
      <DialogSection title="Deals" description="SAP settles each transaction (BAPI_FTR_FXT_SETTLE), one at a time; the run stops at the first failure.">
        <div className="tsf-confirm__deals">{deals.map((d, i) => <DealCard key={d.key} d={d} open={i === 0} />)}</div>
      </DialogSection>
      <DialogSection title="References and remarks" description="Saved on every selected deal. External Ref cannot be saved yet (the SAP FX service has no External Reference property): leave it empty.">
        <div className="tsf-fields">
          <label className="tsf-field">External Ref<input maxLength={16} value={extRef} onChange={e => setExtRef(e.target.value)} /></label>
          <label className="tsf-field">Internal Ref<input maxLength={15} value={intRef} onChange={e => setIntRef(e.target.value)} /></label>
        </div>
        <label className="tsf-field">MO Remarks<textarea maxLength={MO_REMARK_MAX} value={moRemark} onChange={e => setMoRemark(e.target.value)} /></label>
        {error && <p className="tsf-err" role="alert">{error}</p>}
      </DialogSection>
    </Modal>
  );
}

function CorrectionDialog({ deals, busy, onClose, onConfirm }: { deals: ConfDeal[]; busy: boolean; onClose: () => void; onConfirm: (moRemark: string) => void }) {
  const [moRemark, setMoRemark] = useState('');
  const [error, setError] = useState('');
  const send = () => { if (busy) return; if (!moRemark.trim()) { setError('MO Remarks is required.'); return; } onConfirm(moRemark.trim()); };
  return (
    <Modal title="Correction Required" subtitle="The deal goes back to the Front Office; SAP is not called." onClose={onClose} onPrimary={send}
      footer={<><button className="button secondary" onClick={onClose}>Cancel</button><button className="button danger" disabled={busy} onClick={send}>{busy ? 'Working…' : 'Correction Required'}</button></>}>
      <DialogSection title={deals.length === 1 ? `Deal ${deals[0].dealId}` : `${deals.length} deals selected`}>
        <dl className="tsf-facts">
          {deals.length === 1
            ? <><div><dt>Deal ID</dt><dd>{deals[0].dealId}</dd></div><div><dt>Partner</dt><dd>{deals[0].partner}</dd></div><div><dt>Cover No</dt><dd>{deals[0].transaction}</dd></div></>
            : deals.map(d => <div key={d.key}><dt>{d.dealId}</dt><dd>{d.transaction} · {d.partner}</dd></div>)}
        </dl>
      </DialogSection>
      <label className="tsf-field">MO Remarks *
        <textarea placeholder="Enter reason for correction" maxLength={MO_REMARK_MAX} value={moRemark} aria-invalid={Boolean(error)} onChange={e => { setMoRemark(e.target.value); setError(''); }} />
        {error && <span className="tsf-err" role="alert">{error}</span>}
      </label>
    </Modal>
  );
}
