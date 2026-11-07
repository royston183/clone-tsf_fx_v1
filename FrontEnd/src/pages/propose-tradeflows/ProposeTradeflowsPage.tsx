// Propose Tradeflows: Deal IDs with what is left of them in USD, and for the chosen one, proposals of free BLs of its
// commodity that add up to that amount (±1%). The app finds the combinations (deterministic, on real SAP rows); typed
// conditions filter what it may use (read by the app, or by the AI for what the app cannot read); the AI ranks and
// explains. A proposal opens in a modal, where it is accepted after the BLs are checked again against SAP.
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, HelpCircle, ListChecks, Search, SlidersHorizontal, Sparkles, Wand2, X } from 'lucide-react';
import { DataTable } from '@/components/table/DataTable';
import { TrafficLightTag } from '@/components/ui/Badge';
import { Notice } from '@/components/ui/Notice';
import { Toast, useToast } from '@/components/ui/Toast';
import { onSampleData } from '@/lib/client/data';
import { formatAmount, formatCompact, formatDate } from '@/lib/fields/parse';
import { str } from '@/lib/grid/grid';
import type { Row } from '@/lib/grid/types';
import { assignedTotal, candidates, type Combination } from '@/lib/propose/match';
import { dealMismatch, mergeCriteria, readConditions, targetOf, type Criteria } from '@/lib/propose/query';
import { sampleProposeData, type Interpretation, type ProposeData } from './data';
import { liveProposeData } from './live';
import { acceptPlan, assignedByTradeflow, commodityNote, dealRows, DEFAULT_ANSWERS, waysOf, distinctProposals, proposalsUnder, rulesOf, type DealRow, type Fill, type FillAnswers } from './logic';
import { AssignedGroups, AssignedModal } from './parts';
import { BeanLoader } from './BeanLoader';
import { ProposalModal } from './ProposalModal';
import { orderByRules, progressPct } from './view';
import './propose.css';

interface Loaded { deals: DealRow[]; bls: Row[]; commodities: Row[] }
export interface Proposal { combo: Combination; reason: string }
/** One condition as typed and applied; the conditions stack, and each can be removed on its own. */
export interface Entry { id: number; text: string; reading: Interpretation }
const usd = (v: string | null) => (v === null || v === '' ? '—' : `${formatAmount(v)} USD`);
/** The most BL detail rows one AI request carries (the BackEnd accepts 1,000). */
const AI_BL_ROWS = 1000;
const STATUS_TONE = { Open: 'amber', Filled: 'green', 'No USD rate': 'red' } as const;
const FIT_LABEL = { over: 'Covers the deal', under: 'Partial fill' } as const;
const FILLS: [Fill, string][] = [['fewest', 'Fewest BLs'], ['closest', 'Closest amount'], ['oldest', 'Oldest trade flows']];
/** What each way of filling means for the person choosing (shown under the proposal). */
const WAY: Record<string, { name: string; note: string }> = {
  fewest: { name: 'Fewest BLs', note: 'Biggest BLs first: the fewest BLs to handle, but it uses up the large ones.' },
  closest: { name: 'Closest amount', note: 'Nearest to the amount left: the least left over or short.' },
  oldest: { name: 'Oldest BLs', note: 'Oldest BL dates first: clears the aged BLs before newer ones.' },
  contracts: { name: 'Fewest contracts', note: 'Keeps to as few contracts as it can: simpler documents.' },
  parties: { name: 'Fewest notify parties', note: 'Keeps to as few notify parties as it can: fewer counterparties.' }
};
const SHOWN = 6;
/** What is left of the deals shown, open ones only (a filled deal can be a little over or under). */
const totalLeft = (deals: DealRow[]) => (deals.filter(d => d.status === 'Open').reduce((sum, d) => sum + Math.round(Number(d.remainingUsd || 0) * 100), 0) / 100).toFixed(2);
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** What can be typed in the bar, by kind (the guide under "What can I type?"). */
const GUIDE: [string, string[]][] = [
  ['Leave BLs out or keep them in', ['exclude BL 4000001234', 'exclude BLs 4000001000 to 4000001100', 'only BLs 4000001000 to 4000001600', 'must include BL 4000001234', 'exclude trade flow 3000001234']],
  ['Dates', ['BL date in October', 'BLs dated after 15 Oct 2026', 'shipped before 01 Nov 2026', 'ETA between 01 Nov 2026 and 30 Nov 2026']],
  ['Value and quantity', ['BLs above 50K', 'BLs between 20K and 60K', 'quantity above 60000 LBS']],
  ['Contract, notify party, invoice', ['only contract VAR-CTR-ARA', 'exclude notify party Olam', 'exclude invoice VAR-INV-12', 'BL reference VAR-ARA-00*']],
  ['How many BLs, which first', ['at least 300 BLs', 'at most 450 BLs', 'oldest first', 'fewest trade flows']],
  ['Part of the deal', ['fill 50%', 'propose 1 Cr only']],
  ['Across deals', ['show deals above 1 Cr', 'deals with left above 50L']]
];
/** A long list of BLs in a chip: the first few, then how many in all. */
const short = (label: string) => (label.length > 90 ? `${label.slice(0, 80).replace(/,\s*\d*$/, '')}, … (${label.split(',').length} in all)` : label);
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export default function ProposeTradeflowsPage() {
  // Live data once its modules have a source (SAP, the middleware, the AI); the sample data otherwise.
  const data = useMemo(() => (onSampleData('bl-assign') ? sampleProposeData() : liveProposeData()), []);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [selected, setSelectedDeal] = useState('');
  const setSelected = (id: string) => {
    // (The same list when nothing is cleared: a new one would make the proposals be worked out again for nothing.)
    if (id !== selected) setEntries(list => { const kept = list.filter(e => e.reading.criteria.scope === 'all'); return kept.length === list.length ? list : kept; });
    setSelectedDeal(id);
  };
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'open' | 'assigned' | 'all'>('open');
  const [answers, setAnswers] = useState<FillAnswers>(DEFAULT_ANSWERS);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [viewing, setViewing] = useState<DealRow | null>(null);
  const [toast, notify] = useToast();
  // What has arrived while the page loads (the loader ticks each one off).
  const [ready, setReady] = useState<Record<string, string>>({});

  useEffect(() => {
    let live = true;
    const tick = <T,>(key: string, p: Promise<T>, note: (x: T) => string) => p.then(x => { if (live) setReady(r => ({ ...r, [key]: note(x) })); return x; });
    Promise.all([
      tick('deals', data.deals(), d => `${d.length} deals`),
      tick('bls', data.bls(), b => `${b.length.toLocaleString('en-US')} BLs`),
      tick('commodities', data.commodities(), c => `${c.length} commodities`),
      tick('rates', data.rates(), r => `${Object.keys(r).length} currencies`)
    ]).then(([deals, bls, commodities, rates]) => {
      if (live) setLoaded({ deals: dealRows(deals, bls, rates), bls, commodities });
    }, (e: Error) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [data, reload]);

  const criteria = useMemo(() => mergeCriteria(entries.map(e => e.reading.criteria)), [entries]);
  const acrossDeals = criteria.scope === 'all';
  const q = search.trim().toLowerCase();
  const assignedCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of loaded?.bls ?? []) if (str(b.dealId) && str(b.deletedFlag) !== 'X') m.set(str(b.dealId), (m.get(str(b.dealId)) ?? 0) + 1);
    return m;
  }, [loaded]);
  // "With BLs" lists only the deals that have BLs; "Open" keeps the chosen deal while it fills.
  const shown = (loaded?.deals ?? []).filter(d => (view === 'all'
      || (view === 'open' ? d.status === 'Open' || d.dealId === selected : (assignedCount.get(d.dealId) ?? 0) > 0))
    && (!q || `${d.dealId} ${d.dealDesc} ${d.tsfCommodity} ${d.tsfCommodityText}`.toLowerCase().includes(q))
    // A search across deals keeps only the deals the conditions accept.
    && (!acrossDeals || !dealMismatch(d, criteria, loaded?.commodities ?? [])));
  // The list marks the deal at once; its panel (proposals for 300-500 BLs) follows in the background.
  const opened = useDeferredValue(selected);
  const deal = loaded?.deals.find(d => d.dealId === opened) ?? null;

  return (
    <section className="tsf-propose">
      {data.sample && <Notice>Running on sample data: Deal IDs, BLs and rates are examples, and the AI is not connected.</Notice>}
      {error && <Notice error><AlertCircle size={16} />{error}</Notice>}
      {!loaded && !error && <BeanLoader steps={['deals', 'bls', 'commodities', 'rates'].map(k => ({ done: k in ready }))} />}
      {loaded && (
        <div className="tsf-propose__layout">
          <aside className="panel tsf-propose__deals" aria-label="Deal IDs">
            <div className="tsf-propose__deals-head">
              <h2>Deal IDs <span>{shown.length}</span></h2>
              <label className="tsf-propose__search"><Search size={13} />
                <input className="input" placeholder="Search Deal ID, description, commodity" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search Deal IDs" />
              </label>
              <div className="tsf-propose__filter tsf-tabs" role="group" aria-label="Show deals">
                {([['open', 'Open'], ['assigned', 'With BLs'], ['all', 'All']] as const).map(([id, label]) => (
                  <button key={id} className={view === id ? 'on' : ''} aria-pressed={view === id} onClick={() => setView(id)}>{label}<span className="count" aria-hidden="true">{
                    (loaded.deals).filter(d => id === 'all' || (id === 'open' ? d.status === 'Open' : (assignedCount.get(d.dealId) ?? 0) > 0)).length}</span></button>
                ))}
              </div>
              {acrossDeals && <p className="tsf-propose__scoped"><SlidersHorizontal size={12} />Filtered by the conditions<button className="tsf-propose__link" aria-label="Clear the conditions filtering the deals" onClick={() => setEntries([])}>Clear</button></p>}
            </div>
            {shown.length > 0 ? (
              <div className="tsf-propose__dealscroll">
              <DataTable nativeLayout nativeExport aria-label="Deal IDs" className="tsf-propose__dealtable">
                <thead><tr><th>Deal ID</th><th>Commodity</th><th className="num">Left (USD)</th><th>Status</th></tr></thead>
                <tbody>{shown.map(d => {
                  const n = assignedCount.get(d.dealId) ?? 0;
                  return (
                    <tr key={d.dealId} data-table-row="" className={d.dealId === selected ? 'selected' : ''} onClick={() => setSelected(d.dealId)}>
                      <td><button className="tsf-propose__dealid mono" onClick={e => { e.stopPropagation(); setSelected(d.dealId); }} aria-pressed={d.dealId === selected} aria-label={`Deal ${d.dealId} ${d.status}`}>{d.dealId}</button>
                        {n > 0 && <button className="tsf-propose__bls-link" onClick={e => { e.stopPropagation(); setViewing(d); }} aria-label={`View the BLs assigned to ${d.dealId}`} title={`${n} BLs assigned · ${formatAmount(d.assignedUsd)} USD`}><ListChecks size={11} />{n}</button>}</td>
                      <td>{d.tsfCommodity ? `${d.tsfCommodity}${d.tsfCommodityText ? ` · ${d.tsfCommodityText}` : ''}` : '—'}</td>
                      <td className="num">{d.remainingUsd ? formatAmount(d.remainingUsd) : '—'}</td>
                      <td><TrafficLightTag tone={STATUS_TONE[d.status]}>{d.status}</TrafficLightTag></td>
                    </tr>
                  );
                })}</tbody>
                <tfoot><tr><th>Total</th><th>{shown.length} deal{shown.length === 1 ? '' : 's'}</th><th className="num">{formatAmount(totalLeft(shown))}</th><th /></tr></tfoot>
              </DataTable>
              </div>
            ) : <p className="tsf-propose__muted tsf-propose__pad">{acrossDeals ? 'No matching deals or available BLs found for the selected criteria.' : view === 'assigned' ? 'No deal has BLs assigned yet. Assign a proposal and its deal shows here.' : 'No Deal IDs match.'}</p>}
          </aside>
          <div className="tsf-propose__main">
            {selected !== opened && <p className="tsf-propose__updating" role="status"><span aria-hidden="true" />Opening {selected}…</p>}
            {!deal && (
              <div className="panel tsf-propose__empty">
                <Wand2 size={24} />
                <h3>Choose a Deal ID</h3>
                <p>Its proposals appear here: free BLs of the same commodity whose USD value comes within 1% of what is left of the deal.</p>
              </div>
            )}
            {deal && <DealPanel key={deal.dealId} deal={deal} loaded={loaded} data={data} answers={answers} onAnswers={setAnswers}
              entries={entries} onEntries={setEntries} criteria={criteria}
              firstTab={view === 'assigned' || deal.status !== 'Open' ? 'assigned' : 'proposals'}
              onChanged={text => { notify(text, 'success'); setReload(r => r + 1); }} onError={text => notify(text, 'error')} />}
          </div>
        </div>
      )}
      {viewing && loaded && <AssignedModal deal={viewing} bls={loaded.bls} onClose={() => setViewing(null)} onOpenDeal={() => { setSelected(viewing.dealId); setViewing(null); }} />}
      <Toast toast={toast} />
    </section>
  );
}

function DealPanel({ deal, loaded, data, answers, onAnswers, entries, onEntries, criteria, firstTab, onChanged, onError }: {
  deal: DealRow; loaded: Loaded; data: ProposeData; answers: FillAnswers; onAnswers: (a: FillAnswers) => void;
  entries: Entry[]; onEntries: (e: Entry[] | ((list: Entry[]) => Entry[])) => void; criteria: Criteria; firstTab: 'proposals' | 'assigned';
  onChanged: (t: string) => void; onError: (t: string) => void;
}) {
  const [typed, setTyped] = useState('');
  const [tab, setTab] = useState<'proposals' | 'assigned'>(firstTab);
  const input = useRef<HTMLInputElement>(null);
  const [reading_, setReadingBusy] = useState(false);
  const [ranked, setRanked] = useState<{ key: string; list: Proposal[]; model: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Proposal | null>(null);
  // What the proposals aim at: what is left, or the part the conditions ask for ("fill 50%").
  const aimUsd = targetOf(deal.remainingUsd, criteria);
  const assignedCountHere = assignedByTradeflow(deal.dealId, loaded.bls).count;
  const byNo = useMemo(() => new Map(loaded.bls.map(b => [str(b.blNo), b])), [loaded.bls]);
  const note = commodityNote(deal, loaded.commodities);

  // The proposals: calculated here, on the BLs read from SAP, under the conditions and the options chosen.
  // The chips and chips of conditions change at once; the proposals follow in the background (the search can take a
  // moment on 300-500 BL deals), with "Updating proposals…" meanwhile.
  const lateAnswers = useDeferredValue(answers);
  const lateCriteria = useDeferredValue(criteria);
  const updating = lateAnswers !== answers || lateCriteria !== criteria;
  const computed = useMemo(() => {
    const r = proposalsUnder(deal, loaded.bls, loaded.commodities, lateCriteria, lateAnswers);
    const ordered = orderByRules(r.proposals, rulesOf(lateCriteria), byNo, waysOf(lateAnswers));
    return { reason: r.reason, pool: distinctProposals(ordered, targetOf(deal.remainingUsd, lateCriteria)).slice(0, 20) };
  }, [deal, loaded, lateCriteria, lateAnswers, byNo]);
  const poolKey = computed.pool.map(c => c.bls.join('+')).join('|');

  // The AI ranks the valid proposals and explains them; it never adds one. Without it, the app's own order stands.
  useEffect(() => {
    if (!computed.pool.length) return;
    let live = true;
    const pool = computed.pool;
    const used = [...new Set(pool.flatMap(c => c.bls))].map(no => byNo.get(no) ?? {});
    data.ai({
      deal: { dealId: deal.dealId, tsfCommodity: deal.tsfCommodity, dealUsd: deal.usd ?? '', remainingUsd: deal.remainingUsd },
      candidates: pool, preferences: '',
      // BL details only while they fit the request (a deal can take 200-300 BLs); beyond that the AI ranks on the totals.
      bls: used.length > AI_BL_ROWS ? [] : used.map(b => ({ blNo: str(b.blNo), tfNo: str(b.tfNo), tfDate: str(b.tfDate), quantity: str(b.quantity), usdValue: str(b.usdValue) }))
    }).then(answer => {
      if (!live) return;
      const ai = answer.model !== 'none';
      const list = ai ? answer.ranked.filter(r => pool[r.index]).map(r => ({ combo: pool[r.index], reason: r.reason })) : [];
      setRanked({ key: poolKey, list, model: answer.model });
    }, () => { if (live) setRanked({ key: poolKey, list: [], model: 'none' }); });
    return () => { live = false; };
  }, [computed, poolKey, byNo, data, deal]);

  // Examples for the bar, made of this deal's own free BLs (so each one does something when applied).
  const examples = useMemo(() => {
    const free = candidates(loaded.bls, deal.tsfCommodity, loaded.commodities, {}).sort((a, b) => str(a.blNo).localeCompare(str(b.blNo)));
    if (!free.length) return [];
    const at = (f: number) => str(free[Math.min(free.length - 1, Math.floor(free.length * f))].blNo);
    const most = (f: string) => { const n = new Map<string, number>(); for (const b of free) if (str(b[f])) n.set(str(b[f]), (n.get(str(b[f])) ?? 0) + 1); return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''; };
    const first = free.map(b => str(b.blDate).slice(5, 7)).filter(Boolean).sort()[0];
    const month = first ? MONTH_NAMES[Number(first) - 1] : '';
    const contract = most('contractRef');
    return [`exclude BLs ${at(0.1)} to ${at(0.2)}`, month ? `BL date in ${month}` : '', contract ? `only contract ${contract}` : '', 'BLs above 50K', 'fill 50%', 'at least 300 BLs'].filter(Boolean);
  }, [loaded, deal.tsfCommodity]);
  // A chip applies at once (the bar stays clear for the next condition).
  // The names the deal's free BLs carry: a notify party or contract typed on its own is understood.
  const known = useMemo(() => {
    const free = candidates(loaded.bls, deal.tsfCommodity, loaded.commodities, {});
    const uniq = (f: string) => [...new Set(free.map(b => str(b[f])).filter(Boolean))].slice(0, 200);
    return { notifyParty: uniq('notifyParty'), contractRef: uniq('contractRef') };
  }, [loaded, deal.tsfCommodity]);
  const use = (text: string) => { void apply(text); input.current?.focus(); };
  const remove = (id: number) => onEntries(entries.filter(e => e.id !== id));
  const [hintAt, setHintAt] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setHintAt(n => n + 1), 3500);
    return () => clearInterval(t);
  }, []);
  const hint = examples.length ? examples[hintAt % examples.length] : '';

  const aiOrder = ranked?.key === poolKey && ranked.list.length ? ranked.list : null;
  const proposals: Proposal[] = (aiOrder ?? computed.pool.map(c => ({ combo: c, reason: '' }))).slice(0, SHOWN);
  const model = ranked?.key === poolKey ? ranked.model : '';

  // Each way turns on and off; none chosen means all three.
  const toggleFill = (f: Fill) => {
    onAnswers({ ...answers, fill: answers.fill.includes(f) ? answers.fill.filter(x => x !== f) : [...answers.fill, f] });
  };
  /** Clear all: every way of filling back on, no conditions, an empty bar. */
  // Clear all: no way chosen (the proposals then use all three), no conditions, an empty bar.
  const clearAll = () => { onAnswers({ ...DEFAULT_ANSWERS, fill: [] }); onEntries([]); setTyped(''); };

  const apply = async (given?: string) => {
    const text = (given ?? typed).trim() || hint;
    if (!text) return;
    setReadingBusy(true);
    try {
      const reading = await data.interpret(text, { deal: { dealId: deal.dealId, tsfCommodity: deal.tsfCommodity }, commodities: loaded.commodities, today: todayIso(), known });
      onEntries(list => [...list, { id: list.reduce((m, x) => Math.max(m, x.id), 0) + 1, text, reading }]);
      setTyped('');
    }
    catch (e) { onError((e as Error).message); }
    finally { setReadingBusy(false); }
  };
  const accept = async (p: Proposal) => {
    if (busy) return;
    setBusy(true);
    try {
      const values = Object.fromEntries(p.combo.bls.map(no => [no, str(byNo.get(no)?.usdValue)]));
      await data.assign({ dealId: deal.dealId, usd: deal.usd }, acceptPlan(p.combo, loaded.bls), values);
      setOpen(null);
      setTab('assigned');
      onChanged(`${p.combo.bls.length} BL${p.combo.bls.length > 1 ? 's' : ''} assigned to ${deal.dealId}`);
    } catch (e) { onError((e as Error).message); } finally { setBusy(false); }
  };
  const pct = progressPct(deal);
  const outside = proposals.some(p => p.combo.fit);

  return (
    <>
      <div className="tsf-propose__hero">
        <div className="tsf-propose__hero-title">
          <h2><span className="mono">{deal.dealId}</span> <TrafficLightTag tone={STATUS_TONE[deal.status]}>{deal.status}</TrafficLightTag></h2>
          <p className="tsf-propose__muted">{deal.dealDesc || '—'} · {deal.tsfCommodity || 'no commodity'}{deal.tsfCommodityText ? ` ${deal.tsfCommodityText}` : ''}</p>
          <p className="tsf-propose__net">Deal amount {formatAmount(deal.amount)} {deal.currency}<small className="num-short">{formatCompact(deal.amount)}</small> · Assigned {formatAmount(deal.assignedUsd)} USD<small className="num-short">{formatCompact(deal.assignedUsd)}</small> ({assignedCountHere} BL{assignedCountHere === 1 ? '' : 's'}) · Left <b>{deal.remainingUsd ? `${formatAmount(deal.remainingUsd)} USD` : '—'}</b>{deal.remainingUsd && <small className="num-short">{formatCompact(deal.remainingUsd)}</small>}</p>
        </div>
        <div className="tsf-propose__progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Assigned share of the deal"><span style={{ width: `${pct}%` }} /></div>
      </div>
      {deal.status === 'No USD rate' && <Notice kind="warn">No USD rate for {deal.currency} today: this Deal ID gets no proposals until SAP has one (rate type M).</Notice>}
      {deal.status === 'Filled' && <Notice>This Deal ID is filled within 1%.</Notice>}
      {note && <Notice kind="warn">{note}</Notice>}

      <div className="tsf-tabs tsf-propose__tabs" role="tablist" aria-label={`${deal.dealId} views`}>
        <button role="tab" aria-selected={tab === 'proposals'} className={tab === 'proposals' ? 'on' : ''} onClick={() => setTab('proposals')}>Proposals<span className="count">{deal.status === 'Open' ? proposals.length : 0}</span></button>
        <button role="tab" aria-selected={tab === 'assigned'} className={tab === 'assigned' ? 'on' : ''} onClick={() => setTab('assigned')}>Assigned BLs<span className="count">{assignedCountHere}</span></button>
      </div>

      {tab === 'proposals' && deal.status !== 'Open' && <p className="tsf-propose__muted tsf-propose__pad">No proposals: {deal.status === 'Filled' ? 'the deal is filled.' : 'the deal has no USD rate.'}</p>}
      {tab === 'proposals' && deal.status === 'Open' && (
        <div className="panel tsf-propose__proposals">
          <form className="tsf-cmd" onSubmit={e => { e.preventDefault(); void apply(); }}>
            <div className="tsf-cmd__bar">
              <Sparkles size={16} className="tsf-cmd__icon" aria-hidden="true" />
              <input ref={input} value={typed} onChange={e => setTyped(e.target.value)} aria-label="Conditions"
                placeholder={hint ? `Try: ${hint}` : 'Tell the app which BLs to use'} />
              <button className="button small" disabled={reading_ || (!typed.trim() && !hint)} title={typed.trim() ? undefined : `Applies: ${hint}`}>{reading_ ? 'Reading…' : 'Apply'}</button>            </div>
            {examples.length > 0 && (
              <div className="tsf-cmd__try" aria-label="Examples to try">
                <span>Try</span>
                {examples.map(x => <button key={x} type="button" className="tsf-cmd__eg" onClick={() => use(x)}>{x}</button>)}
              </div>
            )}
            <details className="tsf-cmd__help">
              <summary><HelpCircle size={13} />What can I type?</summary>
              <div className="tsf-cmd__guide">
                {GUIDE.map(([title, list]) => (
                  <div key={title}><h5>{title}</h5>{list.map(x => <button key={x} type="button" className="tsf-cmd__eg" onClick={() => use(x)}>{x}</button>)}</div>
                ))}
                <p>Conditions stack: apply one, then another; remove any with its ×. Words the app cannot place go to the AI when it is connected; anything still not understood is shown and never guessed.</p>
              </div>
            </details>
          </form>
          {entries.length > 0 && (
            <div className="tsf-propose__understood" aria-label="Applied conditions">
              {entries.map(e => (
                <span key={e.id} className="tsf-cmd__chip" title={e.text}>
                  {e.reading.applied.map(a => <span key={a} className="tsf-propose__rule">{short(a)}</span>)}
                  {e.reading.notUnderstood.map(n => <span key={n} className="tsf-propose__not">Not applied: {n}</span>)}
                  <button type="button" className="tsf-cmd__x" aria-label={`Remove condition: ${e.text}`} onClick={() => remove(e.id)}><X size={11} /></button>
                </span>
              ))}
              <button className="tsf-propose__link" aria-label="Clear conditions" onClick={() => { onEntries([]); setTyped(''); }}><X size={12} />Clear conditions</button>
            </div>
          )}

          <div className="tsf-propose__options">
            <div role="group" aria-label="Fill the deal with">
              <span>Fill with</span>
              {FILLS.map(([id, label]) => <button key={id} className={`tsf-propose__opt${answers.fill.includes(id) ? ' on' : ''}`} aria-pressed={answers.fill.includes(id)} onClick={() => toggleFill(id)}>{label}</button>)}
              <button type="button" className="tsf-propose__reset" aria-label="Clear all selections and conditions" onClick={clearAll}><X size={12} />Clear all</button>
              {!answers.fill.length && <span className="tsf-propose__allways">All ways</span>}
            </div>
            {criteria.target && <span className="tsf-propose__aim">Aiming at <b>{formatAmount(aimUsd)} USD</b> of {formatAmount(deal.remainingUsd)} left</span>}
          </div>
          {updating && <p className="tsf-propose__updating" role="status"><span aria-hidden="true" />Updating proposals…</p>}
          {computed.reason && <p className="tsf-propose__none" role="status">{computed.reason}</p>}
          {!computed.reason && outside && <p className="tsf-propose__hint">Nothing comes within 1% of {usd(aimUsd)}: these are the closest. <b>Covers the deal</b> caps its last BL at what is left; <b>Partial fill</b> leaves part open.</p>}
          {proposals.length > 0 && (
            <div className="tsf-propose__listwrap"><DataTable nativeLayout nativeExport aria-label="Proposals" className="tsf-propose__list">
              <thead><tr><th>Proposal</th><th className="num">Assigns (USD)</th><th className="num">{criteria.target ? 'vs aim' : 'vs left'}</th><th className="num">BLs</th><th>BL dates</th></tr></thead>
              <tbody>{proposals.map((p, i) => {
                const rows = p.combo.bls.map(no => byNo.get(no) ?? {});
                const dates = rows.map(r => str(r.blDate) || str(r.tfDate)).filter(Boolean).sort();
                const way = `${p.combo.kinds?.map(k => WAY[k]?.name).filter(Boolean).join(' · ') ?? ''}${(p.combo.alt ?? 1) > 1 ? ` · alt. ${p.combo.alt}` : ''}`;
                const note = p.combo.kinds?.[0] ? WAY[p.combo.kinds[0]]?.note : '';
                const nos = p.combo.bls;
                const label = `${p.combo.fit ? FIT_LABEL[p.combo.fit] : i === 0 ? 'Best match' : `Option ${i + 1}`}${way ? ` · ${way}` : ''}`;
                return (
                  <tr key={nos.join('+')} data-table-row="" className={i === 0 ? 'best' : ''} onDoubleClick={() => setOpen(p)}>
                    <td><button className="tsf-propose__link tsf-propose__open" title={note} onClick={() => setOpen(p)} aria-label={`Proposal ${i + 1}: ${nos.length} BLs, ${assignedTotal(p.combo, aimUsd)} USD`}>{i + 1}. {label}</button>
                      {p.reason && <span className="tsf-propose__reason" title={p.reason}><Sparkles size={11} />{p.reason}</span>}</td>
                    <td className="num"><b>{formatAmount(assignedTotal(p.combo, aimUsd))}</b>{p.combo.cap && <small className="tsf-propose__sub">BL {p.combo.cap.blNo} capped at {formatAmount(p.combo.cap.usd)}</small>}</td>
                    <td className="num"><span className={`tsf-propose__match${p.combo.fit ? ' out' : Math.abs(p.combo.diffPct) <= 0.1 ? ' exact' : ''}`}>{p.combo.cap ? 'fills exactly' : `${p.combo.diffPct > 0 ? '+' : ''}${p.combo.diffPct.toFixed(2)}%`}</span></td>
                    <td className="num">{nos.length}</td>
                    <td className="tsf-propose__nowrap tsf-propose__bls" title={`${dates.length ? `${formatDate(dates[0])} → ${formatDate(dates[dates.length - 1])}
` : ''}BLs: ${nos.join(', ')}`}>{dates.length ? `${formatDate(dates[0]).slice(0, 5)} → ${formatDate(dates[dates.length - 1]).slice(0, 5)}` : '—'}</td>
                  </tr>
                );
              })}</tbody>
            </DataTable></div>
          )}
          {model && model !== 'none' && proposals.length > 0 && <p className="tsf-propose__muted">Ranked and explained by {model}; every amount is calculated by the app.</p>}
        </div>
      )}

      {tab === 'assigned' && (
        <div className="panel tsf-propose__assigned">
          <h3>Assigned BLs <span>{assignedCountHere}</span></h3>
          <AssignedGroups dealId={deal.dealId} bls={loaded.bls} />
        </div>
      )}

      {open && <ProposalModal proposal={open} rank={Math.max(1, proposals.findIndex(p => p.combo.bls.join('+') === open.combo.bls.join('+')) + 1)} deal={deal} aimUsd={aimUsd} bls={byNo} busy={busy}
        onClose={() => setOpen(null)} onAccept={() => { void accept(open); }}
        onDrop={nos => {
          // The BLs unticked in the proposal leave the pool: a condition like any typed one, removable with its ×.
          const text = `exclude BL ${nos.join(', ')}`;
          onEntries(list => [...list, { id: list.reduce((m, x) => Math.max(m, x.id), 0) + 1, text, reading: { ...readConditions(text, loaded.commodities), model: 'none' } }]);
          setOpen(null);
        }} />}
    </>
  );
}
