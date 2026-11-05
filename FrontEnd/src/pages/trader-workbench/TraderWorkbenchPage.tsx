// FO: Trader Workbench (ZSGTSFR100): settle Deal IDs by exercising or expiring options, fixing NDF rates and booking spots.
// Reads live (middleware Deal IDs and masters, SAP transactions); writes are not connected yet: every action changes in-memory state only.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import type { CustomPageProps } from '@/pages/registry';
import { Modal } from '@/components/ui/Modal';
import { Toast, useToast } from '@/components/ui/Toast';
import { Notice } from '@/components/ui/Notice';
import { TrafficLightTag } from '@/components/ui/Badge';
import { useRouter } from '@/lib/client/nav';
import { FxTable, type FxColumn } from '@/pages/fx/FxTable';
import { FxKpis, type FxKpi } from '@/pages/fx/FxKpis';
import { addDays, amt, compact, date, isoToday, rate } from '@/pages/fx/format';
import '@/pages/fx/fx.css';
import './trader-workbench.css';
import { actionOf, dealTone, isPending, type Deal, type Txn } from './data';
import { loadWorkbench, messageOf, type WbData } from './live';
import { DealModal } from './DealModal';

const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
type Kpi = 'scope' | 'due' | 'overdue' | 'pending' | 'progress' | 'pnl';
interface Breakdown { title: string; deals?: Deal[]; acts?: Txn[] }

const DEAL_COLS = (open: (d: Deal) => void, modelText: (id: string) => string, statusText: (code: string) => string): FxColumn<Deal>[] => [
  { id: 'id', label: 'Deal ID', kind: 'code', value: r => r.id, render: r => <button className="tsf-link" onClick={e => { e.stopPropagation(); open(r); }}>{r.id}</button> },
  { id: 'type', label: 'Type', value: r => r.type },
  { id: 'sub', label: 'Sub Type', value: r => r.subType },
  { id: 'desc', label: 'Description', value: r => r.desc },
  { id: 'model', label: 'Model', kind: 'code', value: r => r.model },
  { id: 'md', label: 'Model Description', value: r => modelText(r.model) },
  { id: 'st', label: 'Status', kind: 'status', value: r => r.status, render: r => <TrafficLightTag tone={dealTone(r)}>{r.status} · {statusText(r.status)}</TrafficLightTag> },
  { id: 'or', label: 'Origin', value: r => r.origin },
  { id: 'mc', label: 'MC Reference', kind: 'code', value: r => r.mc },
  { id: 'sd', label: 'Start Date', kind: 'date', value: r => r.start, render: r => date(r.start) },
  { id: 'ed', label: 'End Date', kind: 'date', value: r => r.end, render: r => date(r.end) },
  { id: 'mcd', label: 'MC Date', kind: 'date', value: r => r.mcDate, render: r => date(r.mcDate) },
  { id: 'mcc', label: 'MC Curr', kind: 'code', value: r => r.mcCurr },
  { id: 'dc', label: 'Deal Curr', kind: 'code', value: r => r.dealCurr },
  { id: 'mca', label: 'MC Amount', kind: 'amount', value: r => r.mcAmount, render: r => amt(r.mcAmount) },
  { id: 'pl', label: 'P&L', kind: 'amount', value: r => r.pl, render: r => amt(r.pl) },
  { id: 'plc', label: 'P&L Curr', kind: 'code', value: r => r.plCurr },
  { id: 'plr', label: 'P&L Rate', kind: 'rate', value: r => r.plRate, render: r => rate(r.plRate) },
  { id: 'pll', label: 'P&L (Local)', kind: 'amount', value: r => r.plLocal, render: r => amt(r.plLocal) },
  { id: 'lc', label: 'Local Curr', kind: 'code', value: r => r.localCurr },
  { id: 'tr', label: 'Trader Code', kind: 'code', value: r => r.trader },
  { id: 'trn', label: 'Trader', value: r => r.traderName },
  { id: 'rg', label: 'Region', value: r => r.region },
  { id: 'rf', label: 'Deal Ref', value: r => r.ref },
  { id: 'ss', label: 'Short Straddle', value: r => (r.straddle ? 'Yes' : '') }
];

const ACT_COLS: FxColumn<Txn>[] = [
  { id: 'd', label: 'Deal ID', kind: 'code', value: r => r.dealId }, { id: 't', label: 'Transaction', kind: 'code', value: r => r.id }, { id: 'tt', label: 'Txn Type', kind: 'code', value: r => r.txnType },
  { id: 'vd', label: 'Value Date', kind: 'date', value: r => r.value, render: r => date(r.value) },
  { id: 'a', label: 'Amount 1', kind: 'amount', value: r => r.amt1, render: r => amt(r.amt1) }, { id: 'c', label: 'Curr 1', kind: 'code', value: r => r.cur1 },
  { id: 's', label: 'Action Item', kind: 'status', value: r => (isPending(r) ? 'Pending' : 'Done'), render: r => (isPending(r) ? <TrafficLightTag tone="amber">Pending</TrafficLightTag> : <TrafficLightTag tone="green">Done</TrafficLightTag>) }
];

type Load = { k: 'loading' } | { k: 'error'; message: string } | { k: 'ready'; data: WbData };

export default function TraderWorkbenchPage({ node }: CustomPageProps) {
  const [load, setLoad] = useState<Load>({ k: 'loading' });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const ac = new AbortController();
    loadWorkbench(ac.signal).then(data => setLoad({ k: 'ready', data }), e => { if (!ac.signal.aborted) setLoad({ k: 'error', message: messageOf(e) }); });
    return () => ac.abort();
  }, [tick]);
  const reload = () => { setLoad({ k: 'loading' }); setTick(t => t + 1); };

  if (load.k === 'ready') return <Workbench key={load.data.readAt} node={node} data={load.data} onReload={reload} />;
  return (
    <div className="tsf-page tsf-workbench">
      <div className="tsf-head">
        <div><h1>FO: Trader Workbench</h1><p>{node.title}: settle Deal IDs by exercising or expiring options, fixing NDF rates and booking settlement spots.</p></div>
        <div className="tsf-head__meta"><span className="tsf-tcode">ZSGTSFR100</span><TrafficLightTag tone={load.k === 'error' ? 'red' : 'amber'}>{load.k === 'error' ? 'Not loaded' : 'Loading…'}</TrafficLightTag></div>
      </div>
      {load.k === 'loading'
        ? <p className="tsf-wb-hint" role="status">Reading Deal IDs, masters and transactions…</p>
        : <Notice error action={{ label: 'Retry', onClick: reload }}>The workbench could not be loaded: {load.message}</Notice>}
    </div>
  );
}

const NOT_SAVED = 'Not saved: SAP posting is connected in the next round.';

function Workbench({ node, data, onReload }: { node: CustomPageProps['node']; data: WbData; onReload: () => void }) {
  const router = useRouter();
  const [toast, notify] = useToast();
  const [today] = useState(() => isoToday());
  const [txns, setTxns] = useState<Txn[]>(data.txns);
  const [diffSpots, setDiffSpots] = useState<string[]>([]);
  const [from, setFrom] = useState(() => addDays(today, -60));
  const [to, setTo] = useState(() => addDays(today, 120));
  const [q, setQ] = useState('');
  const [model, setModel] = useState('');
  const [dealId, setDealId] = useState('');
  const [status, setStatus] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [kpi, setKpi] = useState<Kpi | null>(null);

  const DEALS = data.deals;
  const modelText = useCallback((id: string) => data.models.find(m => m.code === id)?.text ?? '', [data.models]);
  const statusText = useCallback((code: string) => data.dealStatuses.find(s => s.code === code)?.text ?? code, [data.dealStatuses]);

  const fromError = from ? '' : 'Required';
  const toError = !to ? 'Required' : from && to < from ? 'Before From date' : '';
  const validRange = !!from && !!to && to >= from;

  const inRange = useMemo(() => (validRange ? DEALS.filter(d => d.status !== '30' && d.end <= to && (d.end >= from || d.straddle)) : []), [DEALS, from, to, validRange]);
  const rows = useMemo(() => inRange.filter(d =>
    (!model || d.model === model) && (!dealId || d.id === dealId) && (!status || d.status === status) &&
    (!q.trim() || [d.id, d.desc, d.mc, d.ref, d.model, d.subType].some(v => v.toLowerCase().includes(q.trim().toLowerCase())))), [inRange, model, dealId, status, q]);

  const k = useMemo(() => {
    const open = rows.filter(d => !d.closed);
    const due = open.filter(d => d.end >= today && dayDiff(d.end, today) <= 7).sort((a, b) => a.end.localeCompare(b.end));
    const over = open.filter(d => d.end < today).sort((a, b) => a.end.localeCompare(b.end));
    const all = rows.flatMap(d => txns.filter(t => t.dealId === d.id && actionOf(t)));
    const pend = all.filter(isPending);
    const usd = rows.filter(d => d.plCurr === 'USD');
    return {
      due, over, pend, all, usd,
      notional: rows.filter(d => d.mcAmountCurr === 'USD').reduce((s, d) => s + d.mcAmount, 0),
      gain: usd.filter(d => d.pl > 0).reduce((s, d) => s + d.pl, 0), loss: usd.filter(d => d.pl < 0).reduce((s, d) => s + d.pl, 0),
      pendDeals: new Set(pend.map(t => t.dealId)).size
    };
  }, [rows, txns, today]);
  const net = k.gain + k.loss;
  const donePct = k.all.length ? Math.round(((k.all.length - k.pend.length) / k.all.length) * 100) : 0;

  const kpis: FxKpi[] = [
    { id: 'scope', label: 'Deals in Scope', value: rows.length, note: `≈ USD ${compact(k.notional)} notional`, onClick: () => setKpi('scope') },
    { id: 'due', label: 'Due in 7 Days', value: k.due.length, tone: 'amber', note: k.due[0] ? `Next: ${k.due[0].id} · ${date(k.due[0].end)}` : 'Nothing due', onClick: () => setKpi('due') },
    { id: 'overdue', label: 'Overdue', value: k.over.length, tone: 'red', note: k.over[0] ? `Oldest: ${dayDiff(today, k.over[0].end)} days late` : 'None overdue', onClick: () => setKpi('overdue') },
    { id: 'pending', label: 'Pending Actions', value: k.pend.length, tone: 'purple', note: `across ${k.pendDeals} deals`, onClick: () => setKpi('pending') },
    { id: 'progress', label: 'Settlement Progress', value: `${donePct}%`, tone: 'green', note: `${k.all.length - k.pend.length} of ${k.all.length} actions done`, onClick: () => setKpi('progress') },
    { id: 'pnl', label: 'Net P&L (USD)', value: `${net >= 0 ? '+' : '−'}${amt(Math.abs(net))}`, tone: net >= 0 ? 'green' : 'red', note: `${amt(k.gain)} gain · ${amt(Math.abs(k.loss))} loss`, onClick: () => setKpi('pnl') }
  ];

  const sel = rows.find(d => d.id === picked[0]);
  const openDeal = DEALS.find(d => d.id === openId);
  const reset = () => { setFrom(addDays(today, -60)); setTo(addDays(today, 120)); setQ(''); setModel(''); setDealId(''); setStatus(''); setPicked([]); };
  const viewSettlement = () => {
    if (!sel) { notify('Select a Deal ID first.', 'error'); return; }
    notify(`Opening MO: Execute Settlement for Deal ID ${sel.id}`);
    router.push(`/fx-structure/back-office/deal-id-settlement/mo-execute-settlement-deal-id?dealId=${sel.id}`);
  };

  const dealCols = useMemo(() => DEAL_COLS(d => setOpenId(d.id), modelText, statusText), [modelText, statusText]);
  const brkMap: Record<Kpi, Breakdown> = {
    scope: { title: 'Deals in Scope', deals: rows }, due: { title: 'Due in 7 Days', deals: k.due }, overdue: { title: 'Overdue', deals: k.over },
    pending: { title: 'Pending Actions', acts: k.pend }, progress: { title: 'Settlement Progress', acts: k.all }, pnl: { title: 'Net P&L (USD)', deals: k.usd }
  };
  const brk = kpi ? brkMap[kpi] : null;
  const brkDealCols = [dealCols[0], dealCols[3], dealCols[6], dealCols[10], dealCols[15], dealCols[16]];

  return (
    <div className="tsf-page tsf-workbench">
      <div className="tsf-head">
        <div><h1>FO: Trader Workbench</h1><p>{node.title}: settle Deal IDs by exercising or expiring options, fixing NDF rates and booking settlement spots.</p></div>
        <div className="tsf-head__meta">
          <span className="tsf-tcode">ZSGTSFR100</span>
          <TrafficLightTag tone="green">Deal IDs: middleware</TrafficLightTag><TrafficLightTag tone={data.txns.length ? 'green' : 'amber'}>Transactions: SAP</TrafficLightTag>
          <button className="button secondary" onClick={onReload}><RefreshCw size={14} /> Reload</button>
        </div>
      </div>
      <Notice kind="info">Read only this round: the lists are live, but exercise, NDF fixing and spot actions change this page only. {NOT_SAVED}</Notice>
      {data.warnings.map(w => <Notice key={w} kind="warn">{w}</Notice>)}

      <FxKpis items={kpis} label="Settlement key figures" />

      <section className="panel tsf-card">
        <div className="tsf-card__head"><div><h2>Deal ID Details</h2><p>Click a Deal ID to open its transactions and action items</p></div></div>
        <div className="tsf-toolbar">
          <label className="search"><Search size={15} /><input aria-label="Search deals" placeholder="Search deals..." value={q} onChange={e => setQ(e.target.value)} /></label>
          <button className="button secondary" onClick={reset}>Reset</button>
          <button className="button" onClick={viewSettlement}>View Settlement Data</button>
          <span className="tsf-count" role="status">{rows.length} {rows.length === 1 ? 'deal' : 'deals'}</span>
        </div>
        <div className="tsf-fields">
          <label>Settlement Date From *<input type="date" value={from} aria-invalid={!!fromError} onChange={e => setFrom(e.target.value)} />{fromError && <span className="tsf-err" role="alert">{fromError}</span>}</label>
          <label>Settlement Date To *<input type="date" value={to} aria-invalid={!!toError} onChange={e => setTo(e.target.value)} />{toError && <span className="tsf-err" role="alert">{toError}</span>}</label>
          <label>Model<select value={model} onChange={e => setModel(e.target.value)}><option value="">All</option>{data.models.map(m => <option key={m.code} value={m.code}>{m.code} · {m.text}</option>)}</select></label>
          <label>Deal ID<select value={dealId} onChange={e => setDealId(e.target.value)}><option value="">All</option>{inRange.map(d => <option key={d.id} value={d.id}>{d.id}</option>)}</select></label>
          <label>Deal Status<select value={status} onChange={e => setStatus(e.target.value)}><option value="">All</option>{data.dealStatuses.filter(s => s.code !== '30').map(s => <option key={s.code} value={s.code}>{s.code} · {s.text}</option>)}</select></label>
        </div>
        <FxTable label="Deal IDs" columns={dealCols} rows={rows} rowKey={r => r.id} select="single" picked={picked} onPick={setPicked} defaultSort={{ col: 'id', dir: 1 }}
          empty={validRange ? 'No deals match the selected settlement dates, filters or search.' : 'Enter a valid settlement date range to list deals.'} />
      </section>

      {openDeal && <DealModal deal={openDeal} txns={txns.filter(t => t.dealId === openDeal.id)} today={today} diffSpots={diffSpots} statusText={statusText} onClose={() => setOpenId(null)} notify={notify} notSaved={NOT_SAVED}
        onTxn={(id, patch) => setTxns(a => a.map(t => (t.id === id ? { ...t, ...patch } : t)))} onDiffSpot={id => setDiffSpots(a => [...a, id])} />}

      {brk && <Modal title={brk.title} subtitle={`${(brk.deals ?? brk.acts ?? []).length} rows behind this figure`} eyebrow="Breakdown" size="wide" onClose={() => setKpi(null)}
        footer={<button className="button secondary" onClick={() => setKpi(null)}>Close</button>}>
        {brk.deals
          ? <FxTable label={brk.title} columns={brkDealCols} rows={brk.deals} rowKey={r => r.id} empty="Nothing behind this figure." pageSizes={[10, 20]} />
          : <FxTable label={brk.title} columns={ACT_COLS} rows={brk.acts ?? []} rowKey={r => r.id} empty="Nothing behind this figure." pageSizes={[10, 20]} />}
      </Modal>}
      <Toast toast={toast} />
    </div>
  );
}
