// DE6: TSF FX Blotter. FO traders capture FX deals in an editable grid, create them in SAP and release them to the Mid Office.
// Reads live (SAP transactions, middleware masters and Deal IDs, master contracts); writes are not connected yet: every action changes this page only.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Lock, Plus, RefreshCw, Search, Trash2, Undo2 } from 'lucide-react';
import type { CustomPageProps } from '@/pages/registry';
import { DataTable, type TableColumn } from '@/components/table/DataTable';
import { AmountInput } from '@/components/fields/AmountInput';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Notice } from '@/components/ui/Notice';
import { TrafficLightTag } from '@/components/ui/Badge';
import { Toast, useToast } from '@/components/ui/Toast';
import { FxKpis } from '@/pages/fx/FxKpis';
import { addDays, amt, compact, date, isoToday, rate, workingDay } from '@/pages/fx/format';
import { COMPANIES as SAMPLE_COMPANIES, TXN_TYPES } from '@/pages/fx/sample';
import '@/pages/fx/fx.css';
import './fx-blotter.css';
import {
  ACC_CATS, CURRENCIES, DEAL_D1, DEAL_D2, DEAL_SS, FIRST_DEAL, FIRST_RFHA, FIRST_SS, FIX_REFS, MODES, blankRow, nextId,
  type BlotterRow, type Status
} from './data';
import { amount2, applyEdit, enablement, isBlank, isNdf, lockBlock, normalise, num, opposite, rateNum, spotOf, usdOf, validateCreate } from './logic';
import { InfoDialog, McDialog, NotesDialog, SpotDialog, StatusTag, TxnListDialog, UploadDialog, ViewTxnDialog, type SpotDraft } from './InfoDialogs';
import { AssignDialog, AutoDealDialog, PairWizard, SsDialog, type AutoResult } from './ReleaseDialogs';
import { MastersContext, type BlMasters } from './masters';
import { loadBlotterMasters, loadBlotterRows, messageOf, type BlMasterData } from './live';

type Dlg =
  | { k: 'confirmCreate' } | { k: 'created'; numbers: string[] } | { k: 'confirmRev'; id: string } | { k: 'reversed'; ref: string }
  | { k: 'view'; id: string } | { k: 'mc'; mc: string } | { k: 'assign' } | { k: 'pair' } | { k: 'ss' } | { k: 'auto' } | { k: 'spot' }
  | { k: 'lock' } | { k: 'locked' } | { k: 'list' } | { k: 'upload' } | { k: 'notes' };

const COLUMNS: { label: string; kind: TableColumn['kind'] }[] = [
  { label: '', kind: 'flag' }, { label: 'Status', kind: 'status' }, { label: 'RFHA / Draft', kind: 'code' }, { label: 'Deal ID', kind: 'code' }, { label: 'Trade Date*', kind: 'date' },
  { label: 'Company Code*', kind: 'text' }, { label: 'Bank BP*', kind: 'text' }, { label: 'Txn Type*', kind: 'text' }, { label: 'B/S 1', kind: 'text' }, { label: 'Curr 1*', kind: 'text' },
  { label: 'Amount 1*', kind: 'amount' }, { label: 'B/S 2', kind: 'text' }, { label: 'Curr 2*', kind: 'text' }, { label: 'Amount 2', kind: 'amount' }, { label: 'All in Rate*', kind: 'number' },
  { label: 'Swap', kind: 'number' }, { label: 'Spot', kind: 'number' }, { label: 'Value Date*', kind: 'date' }, { label: 'Mode of Trade', kind: 'text' }, { label: 'Acc Category', kind: 'text' },
  { label: 'Profit Center', kind: 'code' }, { label: 'Unit(BA)', kind: 'code' }, { label: 'NDF Fixing Date', kind: 'date' }, { label: 'NDF Fixing Ref', kind: 'text' }, { label: 'MC Ref', kind: 'code' },
  { label: 'Deal Type', kind: 'text' }, { label: 'Actions', kind: 'actions' }
];
const STATUSES = ['All', 'Draft', 'Created', 'Released', 'Reversed'] as const;
const short = (t: string) => (t.length > 18 ? `${t.slice(0, 18)}…` : t);
const NEED_RFHA = 'Create the transaction first. View Transaction requires an RFHA.';
const draftRef = (n: number) => `DRAFT-${String(n).padStart(3, '0')}`;

const NOT_SAVED = 'Not saved: SAP posting is connected in the next round.';

type Boot = { k: 'loading' } | { k: 'error'; message: string } | { k: 'ready'; md: BlMasterData; rows: BlotterRow[]; rowsError: string };

export default function FxBlotterPage({ node }: CustomPageProps) {
  const [boot, setBoot] = useState<Boot>({ k: 'loading' });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      const md = await loadBlotterMasters(ac.signal);
      let rows: BlotterRow[] = [], rowsError = '';
      try { rows = await loadBlotterRows(isoToday(), null, md.bpNames, ac.signal); } catch (e) { if (ac.signal.aborted) return; rowsError = messageOf(e); }
      if (!ac.signal.aborted) setBoot({ k: 'ready', md, rows, rowsError });
    })().catch(e => { if (!ac.signal.aborted) setBoot({ k: 'error', message: messageOf(e) }); });
    return () => ac.abort();
  }, [tick]);
  const retry = () => { setBoot({ k: 'loading' }); setTick(x => x + 1); };

  if (boot.k === 'ready') return <Blotter key={boot.md.readAt} node={node} md={boot.md} initial={boot.rows} initialError={boot.rowsError} />;
  return (
    <div className="tsf-page tsf-blotter" data-node={node.id}>
      <div className="tsf-head">
        <div><h1>DE6: TSF FX Blotter</h1><p>Capture TSF FX deals, create them in SAP and release them to the Mid Office</p></div>
        <div className="tsf-head__meta"><span className="tsf-tcode">ZSGTSFP008</span><TrafficLightTag tone={boot.k === 'error' ? 'red' : 'amber'}>{boot.k === 'error' ? 'Not loaded' : 'Loading…'}</TrafficLightTag></div>
      </div>
      {boot.k === 'loading'
        ? <p className="bl-hint" role="status">Reading the blotter, masters, master contracts and Deal IDs…</p>
        : <Notice error action={{ label: 'Retry', onClick: retry }}>The blotter could not be loaded: {boot.message}</Notice>}
    </div>
  );
}

function Blotter({ node, md, initial, initialError }: { node: CustomPageProps['node']; md: BlMasterData; initial: BlotterRow[]; initialError: string }) {
  const [today] = useState(() => isoToday());
  const [blotterDate, setBlotterDate] = useState(today);
  const [group, setGroup] = useState('');
  const [trader, setTrader] = useState('');
  const [rows, setRows] = useState<BlotterRow[]>(() => normalise(initial, today));
  const [mcs, setMcs] = useState(md.mcs);
  const [deals, setDeals] = useState(md.deals);
  const [ld, setLd] = useState<{ k: 'loading' } | { k: 'error'; message: string } | { k: 'ready' }>(initialError ? { k: 'error', message: initialError } : { k: 'ready' });
  const seq = useRef(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [filter, setFilter] = useState<(typeof STATUSES)[number]>('All');
  const [query, setQuery] = useState('');
  const [locked, setLocked] = useState(false);
  const [dlg, setDlg] = useState<Dlg | null>(null);
  const [counters, setCounters] = useState({ rfha: FIRST_RFHA, deal: FIRST_DEAL, draft: 2, ss: FIRST_SS });
  const [toast, notify] = useToast();

  const real = useMemo(() => rows.filter(r => !isBlank(r)), [rows]);
  const sel = useMemo(() => real.filter(r => selected.includes(r.id)), [real, selected]);
  const en = enablement(sel, locked);
  const traders = useMemo(() => (group ? md.groups.find(g => g.code === group)?.traders ?? [] : [...new Map(md.groups.flatMap(g => g.traders).map(x => [x.code, x])).values()].sort((a, b) => a.code.localeCompare(b.code))), [md.groups, group]);
  const masters = useMemo<BlMasters>(() => {
    const names = md.bpNames;
    const inGroup = md.partners.filter(p => !group || p.group === group);
    return {
      groups: md.groups,
      banks: [...new Map(inGroup.map(p => [p.bp, { code: p.bp, text: p.name }])).values()].sort((a, b) => a.text.localeCompare(b.text)),
      companies: md.companies,
      bankText: c => names[c] || c,
      companyText: c => md.companies.find(x => x.code === c)?.text ?? c
    };
  }, [md, group]);
  const { bankText, companyText } = masters;
  /** The trader codes a load keeps: one trader, the traders of the group, or everyone (null). */
  const tradersOf = (g: string, tr: string): string[] | null => (tr ? [tr] : g ? md.groups.find(x => x.code === g)?.traders.map(x => x.code) ?? [] : null);
  const load = () => {
    const id = ++seq.current;
    setLd({ k: 'loading' });
    loadBlotterRows(blotterDate, tradersOf(group, trader), md.bpNames).then(live => {
      if (id !== seq.current) return;
      // Draft rows stay in this page; Created, Released and Reversed rows are what SAP holds.
      setRows(old => normalise([...live, ...old.filter(r => r.status === 'Draft' && r.touched)], blotterDate));
      setSelected([]);
      setLd({ k: 'ready' });
    }, e => { if (id === seq.current) setLd({ k: 'error', message: messageOf(e) }); });
  };
  const count = (s: Status) => real.filter(r => r.status === s).length;
  const blanks = rows.length - real.length;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(r => {
      if (isBlank(r)) return !q && (filter === 'All' || filter === 'Draft');
      if (filter !== 'All' && r.status !== filter) return false;
      if (!q) return true;
      return [r.status, r.ref, r.dealId, r.company, companyText(r.company), r.bankName ?? bankText(r.bank), r.statusText ?? '', r.txnType, r.bs1, r.cur1, r.cur2, r.amount1, r.rate, r.valueDate, r.mode, r.mc, r.dealType, r.profit, r.unit].join(' ').toLowerCase().includes(q);
    });
  }, [rows, filter, query, bankText, companyText]);
  const shownReal = shown.filter(r => !isBlank(r));

  const commit = (next: BlotterRow[]) => setRows(normalise(next, blotterDate));
  const edit = (r: BlotterRow, p: Partial<BlotterRow>) => {
    let ref = r.ref;
    if (!r.touched) { ref = draftRef(counters.draft); setCounters(c => ({ ...c, draft: c.draft + 1 })); }
    commit(rows.map(x => (x.id === r.id ? { ...applyEdit(x, p), ref } : x)));
  };
  const changeDate = (d: string) => { setBlotterDate(d); setRows(rows.map(r => (isBlank(r) ? { ...r, tradeDate: d } : r))); };
  const toggle = (id: string) => setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));
  const allShown = shownReal.length > 0 && shownReal.every(r => selected.includes(r.id));
  const rowById = (id: string) => rows.find(r => r.id === id);
  const nextDeal = String(counters.deal);

  // Actions
  const newRow = () => {
    const fresh: BlotterRow = { ...blankRow(blotterDate), touched: true, ref: draftRef(counters.draft) };
    setCounters(c => ({ ...c, draft: c.draft + 1 }));
    commit([...real, fresh, ...rows.filter(isBlank)]);
    notify('New blank draft row inserted.');
  };
  const copyRow = () => {
    const copy: BlotterRow = { ...sel[0], id: nextId(), status: 'Draft', ref: draftRef(counters.draft), dealId: '', mc: '', dealType: '' };
    setCounters(c => ({ ...c, draft: c.draft + 1 }));
    commit([...real, copy, ...rows.filter(isBlank)]);
    notify('Row copied as a new draft.');
  };
  const deleteRows = (ids: string[]) => {
    commit(rows.filter(r => !ids.includes(r.id)));
    setSelected(s => s.filter(x => !ids.includes(x)));
    notify(`${ids.length} draft row(s) deleted.`);
  };
  const startCreate = () => {
    const err = validateCreate(sel);
    if (err) notify(err, 'error'); else setDlg({ k: 'confirmCreate' });
  };
  const doCreate = () => {
    let n = counters.rfha;
    const numbers: string[] = [];
    const ids = sel.map(r => r.id);
    const next = rows.map(r => {
      if (!ids.includes(r.id)) return r;
      const ref = String(n++);
      numbers.push(ref);
      return { ...r, status: 'Created' as Status, ref };
    });
    setCounters(c => ({ ...c, rfha: n }));
    commit(next);
    setSelected([]);
    setDlg({ k: 'created', numbers });
  };
  const openView = (r: BlotterRow) => { if (/^DRAFT/.test(r.ref)) notify(NEED_RFHA); else setDlg({ k: 'view', id: r.id }); };
  const startRelease = () => {
    if (sel.length === 1) setDlg({ k: 'assign' });
    else if (sel.length === 2) setDlg({ k: 'pair' });
    else notify('Select exactly 1 (assign to existing Deal ID) or 2 (create new Deal ID) Created transactions.', 'error');
  };
  const release = (ids: string[], p: (i: number) => Partial<BlotterRow>) => {
    commit(rows.map(r => (ids.includes(r.id) ? { ...r, status: 'Released' as Status, ...p(ids.indexOf(r.id)) } : r)));
    setSelected([]);
    setDlg(null);
  };
  const consume = (mc: string, usd: number) => setMcs(ms => ms.map(m => (m.mc === mc ? { ...m, usedUsd: m.usedUsd + usd } : m)));
  const startLock = () => {
    const block = lockBlock(real);
    if (block) notify(block, 'error'); else setDlg({ k: 'lock' });
  };
  const doReverse = (id: string) => {
    const ref = rowById(id)?.ref ?? '';
    commit(rows.map(r => (r.id === id ? { ...r, status: 'Reversed' as Status } : r)));
    setSelected(s => s.filter(x => x !== id));
    setDlg({ k: 'reversed', ref });
  };
  const autoCreate = (a: AutoResult) => {
    const dealId = String(counters.deal);
    const co = SAMPLE_COMPANIES.find(c => c.code === a.origin);
    const [c1, c2] = a.mc.pair.split('/');
    const ndf = a.mc.model === 'M037';
    let n = counters.rfha;
    const made = a.deals.map((d, i): BlotterRow => ({
      ...blankRow(blotterDate), touched: true, status: 'Created', ref: String(n++), dealId, tradeDate: d.tradeDate, company: a.origin, profit: co?.profitCenter ?? '', unit: co?.businessArea ?? '', bank: d.bank,
      txnType: ndf ? 'NDF' : 'FWD', bs1: i === 0 ? 'Buy' : 'Sell', cur1: c1, cur2: c2, amount1: d.amount, rate: d.rate, swap: d.swap, valueDate: d.valueDate, mode: d.mode,
      fixDate: ndf ? d.fixDate : '', fixRef: ndf ? d.fixRef : '', mc: a.mc.mc, dealType: i === 0 ? DEAL_D1 : DEAL_D2
    }));
    setCounters(c => ({ ...c, rfha: n, deal: c.deal + 1 }));
    setDeals(ds => [...ds, { dealId, mc: a.mc.mc, model: a.mc.model, type: 'FX1', legs: 2 }]);
    consume(a.mc.mc, num(a.deals[0].amount));
    commit([...real, ...made, ...rows.filter(isBlank)]);
    setDlg({ k: 'created', numbers: made.map(m => m.ref) });
  };
  const spotBase = (): SpotDraft => ({ company: masters.companies[0]?.code ?? '', txnType: 'SPOT', bank: masters.banks[0]?.code ?? '', rate: '', buy: '', sell: '', tradeDate: blotterDate, valueDate: workingDay(addDays(blotterDate, 2)) });
  const spotCreate = (d: SpotDraft) => {
    const co = SAMPLE_COMPANIES.find(c => c.code === d.company);
    const ref = String(counters.rfha);
    setCounters(c => ({ ...c, rfha: c.rfha + 1, deal: c.deal + 1 }));
    const made: BlotterRow = {
      ...blankRow(blotterDate), touched: true, status: 'Created', ref, dealId: nextDeal, tradeDate: d.tradeDate, company: d.company, profit: co?.profitCenter ?? '', unit: co?.businessArea ?? '', bank: d.bank,
      txnType: d.txnType, bs1: 'Buy', cur1: 'USD', cur2: 'INR', amount1: d.buy, rate: d.rate, swap: '0.00', valueDate: d.valueDate, dealType: 'DS1'
    };
    commit([...real, made, ...rows.filter(isBlank)]);
    setDlg({ k: 'created', numbers: [ref] });
  };

  // Cells
  const text = (v: string) => <span className="bl-ro">{v || '–'}</span>;
  const select = (r: BlotterRow, ed: boolean, field: keyof BlotterRow, label: string, options: { v: string; t: string }[], shownText?: string) => (ed
    ? <select className="bl-in" aria-label={`${label}, ${r.ref || 'new row'}`} value={String(r[field])} onChange={e => edit(r, { [field]: e.target.value } as Partial<BlotterRow>)}>
        <option value="" />{options.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
      </select>
    : text(shownText ?? String(r[field])));
  const input = (r: BlotterRow, ed: boolean, field: keyof BlotterRow, label: string, type: 'date' | 'decimal', shownText: string) => (ed
    ? <input className="bl-in" aria-label={`${label}, ${r.ref || 'new row'}`} {...(type === 'date' ? { type: 'date' } : { inputMode: 'decimal' as const, style: { textAlign: 'right' as const } })}
        value={String(r[field])} onChange={e => edit(r, { [field]: e.target.value } as Partial<BlotterRow>)} />
    : text(shownText));

  const body = shown.map(r => {
    const ed = r.status === 'Draft' && !locked;
    const blank = isBlank(r);
    const cls = r.status === 'Reversed' ? 'is-reversed' : r.status === 'Draft' ? 'is-draft' : '';
    const ndf = isNdf(r.txnType);
    const a2 = amount2(r);
    const typeChip = ndf ? <span className="tsf-chip">NDF</span> : null;
    return (
      <tr key={r.id} className={`${cls}${selected.includes(r.id) ? ' checked' : ''}${blank ? ' bl-blank' : ''}`}>
        <td className="ds-cb bl-s1">{!blank && <input type="checkbox" aria-label={`Select ${r.ref}`} checked={selected.includes(r.id)} onChange={() => toggle(r.id)} />}</td>
        <td className="bl-s2">{blank ? text('') : <StatusTag s={r.status} />}</td>
        <td className="ds-code bl-s3">{text(r.ref)}</td>
        <td className="ds-code">{text(r.dealId)}</td>
        <td>{input(r, ed, 'tradeDate', 'Trade Date', 'date', date(r.tradeDate))}</td>
        <td>{select(r, ed, 'company', 'Company Code', masters.companies.map(c => ({ v: c.code, t: `${c.code} - ${short(c.text)}` })), r.company)}</td>
        <td>{select(r, ed, 'bank', 'Bank BP', masters.banks.map(b => ({ v: b.code, t: b.text })), r.bank ? r.bankName || bankText(r.bank) : '')}</td>
        <td>{ed ? <span className="bl-type">{select(r, ed, 'txnType', 'Txn Type', TXN_TYPES.map(t => ({ v: t.key, t: t.label })))}{typeChip}</span> : <span className="bl-ro">{r.txnType || '–'} {typeChip}</span>}</td>
        <td>{select(r, ed, 'bs1', 'B/S 1', [{ v: 'Buy', t: 'Buy' }, { v: 'Sell', t: 'Sell' }])}</td>
        <td>{select(r, ed, 'cur1', 'Curr 1', CURRENCIES.map(c => ({ v: c, t: c })))}</td>
        <td className="kit-num">{ed ? <AmountInput compact bare value={r.amount1} label={`Amount 1, ${r.ref || 'new row'}`} onValue={v => edit(r, { amount1: v })} /> : text(r.amount1 ? amt(num(r.amount1)) : '')}</td>
        <td>{text(opposite(r.bs1))}</td>
        <td>{select(r, ed, 'cur2', 'Curr 2', CURRENCIES.map(c => ({ v: c, t: c })))}</td>
        <td className="kit-num">{text(a2 ? amt(a2) : '')}</td>
        <td className="kit-num">{input(r, ed, 'rate', 'All in Rate', 'decimal', r.rate ? rate(rateNum(r.rate)) : '')}</td>
        <td className="kit-num">{input(r, ed, 'swap', 'Swap', 'decimal', r.swap ? rate(rateNum(r.swap), 2) : '')}</td>
        <td className="kit-num">{text(spotOf(r) ? rate(spotOf(r)) : '')}</td>
        <td>{input(r, ed, 'valueDate', 'Value Date', 'date', date(r.valueDate))}</td>
        <td>{select(r, ed, 'mode', 'Mode of Trade', MODES.map(m => ({ v: m, t: m })))}</td>
        <td>{select(r, ed, 'accCat', 'Acc Category', ACC_CATS.map(m => ({ v: m, t: m })))}</td>
        <td className="ds-code">{text(r.profit)}</td>
        <td className="ds-code">{text(r.unit)}</td>
        <td>{ndf ? input(r, ed, 'fixDate', 'NDF Fixing Date', 'date', date(r.fixDate)) : text('')}</td>
        <td>{r.txnType === 'NDF' ? select(r, ed, 'fixRef', 'NDF Fixing Ref', FIX_REFS.map(f => ({ v: f, t: f }))) : text('')}</td>
        <td className="ds-code">{r.mc ? <button className="tsf-link" onClick={() => setDlg({ k: 'mc', mc: r.mc })}>{r.mc}</button> : text('')}</td>
        <td>{text(r.dealType)}</td>
        <td>{!blank && <span className="bl-row-actions">
          <button className="button secondary small" onClick={() => openView(r)}>View</button>
          {r.status === 'Draft' && <button className="button secondary small danger-outline" disabled={locked} onClick={() => deleteRows([r.id])}>Del</button>}
          {(r.status === 'Created' || r.status === 'Released') && <button className="button secondary small danger-outline" disabled={locked} onClick={() => setDlg({ k: 'confirmRev', id: r.id })}>Rev</button>}
        </span>}</td>
      </tr>
    );
  });

  const kpis = [
    { id: 'total', label: 'Total Rows', value: real.length, tone: 'blue' as const, onClick: () => setFilter('All'), active: filter === 'All' },
    { id: 'draft', label: 'Draft (Editable)', value: count('Draft'), tone: 'grey' as const, onClick: () => setFilter('Draft'), active: filter === 'Draft' },
    { id: 'created', label: 'Created (RFHA)', value: count('Created'), tone: 'amber' as const, onClick: () => setFilter('Created'), active: filter === 'Created' },
    { id: 'released', label: 'Released to MO', value: count('Released'), tone: 'green' as const, onClick: () => setFilter('Released'), active: filter === 'Released' },
    { id: 'reversed', label: 'Reversed', value: count('Reversed'), tone: 'red' as const, onClick: () => setFilter('Reversed'), active: filter === 'Reversed' },
    { id: 'notional', label: 'Total Notional (USD)', value: compact(real.filter(r => r.status !== 'Reversed').reduce((s, r) => s + num(r.amount1), 0)), note: 'Sum of Amount 1, not reversed', tone: 'purple' as const },
    { id: 'deals', label: 'Deal IDs Generated', value: new Set(real.map(r => r.dealId).filter(Boolean)).size, tone: 'blue' as const }
  ];
  const viewRow = dlg?.k === 'view' ? rowById(dlg.id) : undefined;
  const mcView = dlg?.k === 'mc' ? mcs.find(m => m.mc === dlg.mc) : undefined;

  return (
    <MastersContext.Provider value={masters}>
    <div className="tsf-page tsf-blotter" data-node={node.id}>
      <div className="tsf-head">
        <div>
          <h1>DE6: TSF FX Blotter</h1>
          <p>Capture TSF FX deals, create them in SAP and release them to the Mid Office</p>
        </div>
        <div className="tsf-head__meta">
          <span className="tsf-tcode">ZSGTSFP008</span>
          <TrafficLightTag tone="green">Transactions: SAP</TrafficLightTag><TrafficLightTag tone="green">Masters: middleware</TrafficLightTag>
          <button className="button secondary" onClick={load}><RefreshCw size={14} /> Refresh</button>
        </div>
      </div>

      <div className="tsf-actions bl-actions" role="toolbar" aria-label="Blotter actions">
        <button className="button" disabled={!en.create} onClick={startCreate}>Create Transaction</button>
        <button className="button secondary" disabled={!en.view} onClick={() => sel[0] && openView(sel[0])}>View Transaction</button>
        <button className="button secondary" onClick={() => setDlg({ k: 'list' })}>View Txn List</button>
        <button className="button secondary" disabled={locked} onClick={() => setDlg({ k: 'upload' })}>Upload</button>
        <span className="tsf-sep" aria-hidden="true" />
        <button className="button secondary" disabled={!en.release} title="Select 1 or 2 Created transactions" onClick={startRelease}>Release to MO</button>
        <button className="button secondary" disabled={!en.ss} onClick={() => setDlg({ k: 'ss' })}>Release to MO - SS</button>
        <button className="button secondary" disabled={locked} onClick={startLock}><Lock size={14} /> Lock Blotter</button>
        <button className="button secondary" onClick={() => setDlg({ k: 'notes' })}>Notes</button>
        <span className="tsf-sep" aria-hidden="true" />
        <button className="button secondary" disabled={locked} onClick={() => setDlg({ k: 'auto' })}>Auto-create Deals</button>
        <button className="button secondary" disabled={locked} onClick={() => setDlg({ k: 'spot' })}>Auto Spot</button>
      </div>

      <Notice kind="info">Read only this round: Created, Released and Reversed rows are live from SAP; creating, releasing, reversing, locking and uploading change this page only. {NOT_SAVED}</Notice>
      {md.warnings.map(w => <Notice key={w} kind="warn">{w}</Notice>)}
      {ld.k === 'error' && <Notice error action={{ label: 'Retry', onClick: load }}>The blotter could not be read from SAP: {ld.message}</Notice>}
      {ld.k === 'loading' && <p className="bl-hint" role="status">Reading the blotter from SAP…</p>}
      <FxKpis items={kpis} label="Blotter figures" />
      {locked && <Notice kind="warn">Blotter is locked on this page only. Nothing can be changed here.</Notice>}

      <section className="panel tsf-card" aria-labelledby="bl-title">
        <div className="tsf-card__head"><div><h2 id="bl-title">FX Deal Input Blotter</h2><p>Draft rows are editable in place; Created and Released rows are read-only.</p></div></div>
        <div className="tsf-fields bl-context">
          <label className="tsf-field">Blotter Date<input type="date" value={blotterDate} onChange={e => changeDate(e.target.value)} /></label>
          <label className="tsf-field">Group<select value={group} onChange={e => { setGroup(e.target.value); setTrader(''); }}><option value="">All groups</option>{md.groups.map(g => <option key={g.code} value={g.code}>{g.code} {g.text}</option>)}</select></label>
          <label className="tsf-field">Trader / Trade Code<select value={trader} onChange={e => setTrader(e.target.value)}><option value="">All traders</option>{traders.map(t => <option key={t.code} value={t.code}>{t.code} · {t.text}</option>)}</select></label>
          <div><button className="button" disabled={!blotterDate || ld.k === 'loading'} onClick={load}>Load Blotter</button></div>
        </div>

        <div className="tsf-toolbar">
          <label className="bl-search"><Search size={14} aria-hidden="true" /><input type="search" className="search" aria-label="Search any column" placeholder="Search any column..." value={query} onChange={e => setQuery(e.target.value)} /></label>
          <div className="tsf-seg" role="group" aria-label="Status filter">{STATUSES.map(s => <button key={s} type="button" aria-pressed={filter === s} onClick={() => setFilter(s)}>{s}</button>)}</div>
          {sel.length > 0 && <span className="tsf-chip">{sel.length} selected</span>}
          <span className="tsf-count">{real.length} transactions | {count('Draft')} draft | {blanks} empty</span>
        </div>
        <div className="tsf-toolbar">
          <button className="button secondary small" disabled={locked} onClick={newRow}><Plus size={14} /> New Row</button>
          <button className="button secondary small" disabled={!en.copy} onClick={copyRow}><Copy size={14} /> Copy</button>
          <button className="button secondary small danger-outline" disabled={!en.del} onClick={() => deleteRows(sel.map(r => r.id))}><Trash2 size={14} /> Delete</button>
          <button className="button secondary small danger-outline" disabled={!en.reverse} onClick={() => sel[0] && setDlg({ k: 'confirmRev', id: sel[0].id })}><Undo2 size={14} /> Reverse</button>
        </div>

        <div className="table-wrap ds-table-wrap bl-wrap">
          <DataTable aria-label="FX deal input blotter" className="ds-table bl-grid" columns={COLUMNS.map(c => ({ kind: c.kind }))}>
            <thead><tr>
              {COLUMNS.map((c, i) => i === 0
                ? <th key="cb" className="ds-cb bl-s1"><input type="checkbox" aria-label="Select all shown rows" checked={allShown} onChange={e => setSelected(e.target.checked ? [...new Set([...selected, ...shownReal.map(r => r.id)])] : selected.filter(id => !shownReal.some(r => r.id === id)))} /></th>
                : <th key={c.label} className={i === 1 ? 'bl-s2' : i === 2 ? 'bl-s3' : undefined}>{c.label}</th>)}
            </tr></thead>
            <tbody>{body}</tbody>
          </DataTable>
          {shownReal.length === 0 && (query || filter !== 'All') && <div className="empty">No transactions match the current filters. Load a blotter context or add a new row.</div>}
        </div>
      </section>

      {dlg?.k === 'confirmCreate' && <ConfirmDialog title="Create Transaction(s)" message={`Create ${sel.length} transaction(s) on this page? ${NOT_SAVED} Nothing is posted to SAP.`} confirmLabel="Create" onClose={() => setDlg(null)} onConfirm={doCreate} />}
      {dlg?.k === 'created' && <InfoDialog title="Transaction(s) Created (not saved)" message={`${dlg.numbers.length} transaction(s) added on this page as ${dlg.numbers.join(', ')}. ${NOT_SAVED}`} onClose={() => setDlg(null)} />}
      {dlg?.k === 'confirmRev' && <ConfirmDialog danger title="Reverse Transaction" message={`Reverse transaction ${rowById(dlg.id)?.ref} on this page? ${NOT_SAVED} Nothing is reversed in SAP.`} confirmLabel="Reverse" onClose={() => setDlg(null)} onConfirm={() => doReverse(dlg.id)} />}
      {dlg?.k === 'reversed' && <InfoDialog title="Transaction Reversed (not saved)" message={`Transaction ${dlg.ref} is shown as reversed on this page only. ${NOT_SAVED}`} onClose={() => setDlg(null)} />}
      {viewRow && <ViewTxnDialog row={viewRow} onMc={mc => setDlg({ k: 'mc', mc })} onClose={() => setDlg(null)} />}
      {mcView && <McDialog mc={mcView} onClose={() => setDlg(null)} />}
      {dlg?.k === 'assign' && sel[0] && <AssignDialog row={sel[0]} deals={deals} mcs={mcs} onClose={() => setDlg(null)} onConfirm={d => {
        consume(d.mc, usdOf(sel[0]));
        setDeals(ds => ds.map(x => (x.dealId === d.dealId ? { ...x, legs: x.legs + 1 } : x)));
        release([sel[0].id], () => ({ dealId: d.dealId, mc: d.mc, dealType: DEAL_D2 }));
        notify(`${sel[0].ref} released to MO under Deal ID ${d.dealId} on this page only. ${NOT_SAVED}`, 'info');
      }} />}
      {dlg?.k === 'pair' && sel.length === 2 && <PairWizard rows={sel} mcs={mcs} nextDealId={nextDeal} onClose={() => setDlg(null)} onConfirm={m => {
        consume(m.mc, Math.max(...sel.map(usdOf)));
        setDeals(ds => [...ds, { dealId: nextDeal, mc: m.mc, model: m.model, type: 'FX1', legs: 2 }]);
        setCounters(c => ({ ...c, deal: c.deal + 1 }));
        release(sel.map(r => r.id), i => ({ dealId: nextDeal, mc: m.mc, dealType: i === 0 ? DEAL_D1 : DEAL_D2 }));
        notify(`Deal ID ${nextDeal} shown on this page only; both legs marked released. ${NOT_SAVED}`, 'info');
      }} />}
      {dlg?.k === 'ss' && sel.length === 2 && <SsDialog rows={sel} onClose={() => setDlg(null)} onConfirm={noInv => {
        const id = `SS-${counters.ss}`;
        setCounters(c => ({ ...c, ss: c.ss + 1 }));
        release(sel.map(r => r.id), () => ({ dealId: id, dealType: DEAL_SS }));
        notify(`SS Deal ID ${id}${noInv ? ' (No-Invoice model)' : ''} shown on this page only; both legs marked released. ${NOT_SAVED}`, 'info');
      }} />}
      {dlg?.k === 'auto' && <AutoDealDialog mcs={mcs} today={blotterDate} onClose={() => setDlg(null)} onCreate={autoCreate} />}
      {dlg?.k === 'spot' && <SpotDialog dealId={nextDeal} base={spotBase()} onClose={() => setDlg(null)} onCreate={spotCreate} />}
      {dlg?.k === 'lock' && <ConfirmDialog title="Lock Blotter" message={`Do you want to Lock the Blotter for the day? ${NOT_SAVED} The day is not locked in SAP.`} confirmLabel="Lock" onClose={() => setDlg(null)} onConfirm={() => { setLocked(true); setDlg({ k: 'locked' }); }} />}
      {dlg?.k === 'locked' && <InfoDialog title="Blotter Locked (not saved)" message={`The blotter is locked on this page only. ${NOT_SAVED}`} onClose={() => setDlg(null)} />}
      {dlg?.k === 'list' && <TxnListDialog rows={real} onClose={() => setDlg(null)} onView={openView} />}
      {dlg?.k === 'upload' && <UploadDialog date={blotterDate} group={group} trader={trader} onNotify={notify} onClose={() => setDlg(null)} />}
      {dlg?.k === 'notes' && <NotesDialog onNotify={notify} onClose={() => setDlg(null)} />}
      <Toast toast={toast} />
    </div>
    </MastersContext.Provider>
  );
}
