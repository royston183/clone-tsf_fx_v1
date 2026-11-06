// Propose Tradeflows: Deal IDs with what is left of them in USD, and for the chosen one, proposals of free BLs of its
// commodity that add up to that amount (±1%). The app finds the combinations; the AI ranks them, explains them and
// turns typed preferences into rules. A proposal opens in a modal with its detail, where it can be accepted.
import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, CircleDollarSign, Layers, Search, Server, Sparkles, Undo2, Wand2 } from 'lucide-react';
import { DataTable } from '@/components/table/DataTable';
import { TrafficLightTag } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Loading } from '@/components/ui/Loading';
import { Notice } from '@/components/ui/Notice';
import { Toast, useToast } from '@/components/ui/Toast';
import { onSampleData } from '@/lib/client/data';
import { formatAmount, formatDate } from '@/lib/fields/parse';
import { str } from '@/lib/grid/grid';
import type { Row } from '@/lib/grid/types';
import type { Combination, Rules } from '@/lib/propose/match';
import { criteriaChips, dealMatches, NO_MATCH, type Criterion } from '@/lib/propose/query';
import { fmtQty } from '@/pages/manage-tradeflows/logic';
import { sampleProposeData, type ProposeData } from './data';
import { liveProposeData } from './live';
import { acceptPlan, commodityNote, dealRows, proposalsFor, ruleChips, type DealRow } from './logic';
import { ProposalModal } from './ProposalModal';
import { contributions, kpis, matchPct, orderByRules, progressPct, QUICK, quickRules } from './view';
import './propose.css';

interface Loaded { deals: DealRow[]; bls: Row[]; commodities: Row[] }
export interface Proposal { combo: Combination; reason: string; deal: DealRow }
const usd = (v: string | null) => (v === null || v === '' ? '—' : `${formatAmount(v)} USD`);
const STATUS_TONE = { Open: 'amber', Filled: 'green', 'No USD rate': 'red' } as const;

export default function ProposeTradeflowsPage() {
  // Live data once its modules have a source (SAP, the middleware, the AI); the sample data otherwise.
  const data = useMemo(() => (onSampleData('bl-assign') ? sampleProposeData() : liveProposeData()), []);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState('');
  const [search, setSearch] = useState('');
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [toast, notify] = useToast();

  useEffect(() => {
    let live = true;
    Promise.all([data.deals(), data.bls(), data.commodities(), data.rates()]).then(([deals, bls, commodities, rates]) => {
      if (live) setLoaded({ deals: dealRows(deals, bls, rates), bls, commodities });
    }, (e: Error) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [data, reload]);

  const figures = loaded ? kpis(loaded.deals, loaded.bls) : null;
  const q = search.trim().toLowerCase();
  const shown = (loaded?.deals ?? []).filter(d => (!onlyOpen || d.status === 'Open' || d.dealId === selected)
    && (!q || `${d.dealId} ${d.dealDesc} ${d.tsfCommodity} ${d.tsfCommodityText}`.toLowerCase().includes(q)));
  const deal = loaded?.deals.find(d => d.dealId === selected) ?? null;

  return (
    <section className="tsf-propose">
      <div className="tsf-propose__top">
        <div className="tsf-propose__source">
          <TrafficLightTag tone={data.sample ? 'amber' : 'green'}><Server size={11} />{data.sample ? 'Sample data' : 'SAP + SLC middleware'}</TrafficLightTag>
          <span>The app finds the combinations; the AI ranks and explains them.</span>
        </div>
        {figures && (
          <dl className="tsf-propose__kpis">
            <div><dt><Layers size={14} />Open deals</dt><dd>{figures.open}</dd></div>
            <div><dt><CircleDollarSign size={14} />Still open</dt><dd>{formatAmount(figures.openUsd)} <small>USD</small></dd></div>
            <div><dt><Sparkles size={14} />Free BLs</dt><dd>{figures.freeBls} <small>· {formatAmount(figures.freeUsd)} USD</small></dd></div>
            <div><dt><CheckCircle2 size={14} />Filled deals</dt><dd>{figures.filled}</dd></div>
          </dl>
        )}
      </div>
      {data.sample && <Notice>Running on sample data: Deal IDs, BLs and rates are examples, and the AI is not connected.</Notice>}
      {error && <Notice error><AlertCircle size={16} />{error}</Notice>}
      {!loaded && !error && <div className="panel"><Loading text="Loading Deal IDs, BLs and rates…" /></div>}
      {loaded && (
        <div className="tsf-propose__layout">
          <aside className="panel tsf-propose__deals" aria-label="Deal IDs">
            <div className="tsf-propose__deals-head">
              <h2>Deal IDs <span>{shown.length}</span></h2>
              <label className="tsf-propose__search"><Search size={14} />
                <input className="input" placeholder="Search Deal ID, description, commodity" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search Deal IDs" />
              </label>
              <label className="tsf-propose__toggle"><input type="checkbox" checked={onlyOpen} onChange={e => setOnlyOpen(e.target.checked)} /> Open only</label>
            </div>
            <ul className="tsf-propose__deal-list">
              {shown.map(d => (
                <li key={d.dealId}>
                  <button className={`tsf-propose__deal${d.dealId === selected ? ' selected' : ''}`} onClick={() => setSelected(d.dealId)} aria-pressed={d.dealId === selected} aria-label={`Deal ${d.dealId}`}>
                    <span className="tsf-propose__deal-row">
                      <b className="mono">{d.dealId}</b>
                      <TrafficLightTag tone={STATUS_TONE[d.status]}>{d.status}</TrafficLightTag>
                    </span>
                    <span className="tsf-propose__deal-desc">{d.dealDesc || '—'}</span>
                    <span className="tsf-propose__deal-row">
                      <span className="tsf-propose__commodity">{d.tsfCommodity || 'No commodity'}{d.tsfCommodityText ? ` · ${d.tsfCommodityText}` : ''}</span>
                      <span className="tsf-propose__deal-left">{d.remainingUsd ? `${formatAmount(d.remainingUsd)} USD left` : `${formatAmount(d.amount)} ${d.currency}`}</span>
                    </span>
                    <span className="tsf-propose__bar" aria-hidden="true"><span style={{ width: `${progressPct(d)}%` }} /></span>
                  </button>
                </li>
              ))}
              {!shown.length && <li className="tsf-propose__muted">No Deal IDs match.</li>}
            </ul>
          </aside>
          <div className="tsf-propose__main">
            {!deal && (
              <div className="panel tsf-propose__empty">
                <Wand2 size={28} />
                <h3>Choose a Deal ID</h3>
                <p>Its proposals appear here at once: combinations of free BLs of the same commodity whose USD value comes within 1% of what is left of the deal.</p>
              </div>
            )}
            {deal && <DealPanel key={deal.dealId} deal={deal} loaded={loaded} data={data}
              onChanged={text => { notify(text, 'success'); setReload(r => r + 1); }} onError={text => notify(text, 'error')}
              onStale={text => { notify(text, 'error'); setReload(r => r + 1); }} />}
          </div>
        </div>
      )}
      <Toast toast={toast} />
    </section>
  );
}

function DealPanel({ deal, loaded, data, onChanged, onError, onStale }: { deal: DealRow; loaded: Loaded; data: ProposeData; onChanged: (t: string) => void; onError: (t: string) => void; onStale: (t: string) => void }) {
  const [chips, setChips] = useState<string[]>([]);
  const [typed, setTyped] = useState('');
  const [sent, setSent] = useState('');
  const [aiRules, setAiRules] = useState<Rules>({});
  // What the question was read into: filters on the deals and BLs, and whether it asked for a search across deals.
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [across, setAcross] = useState(false);
  const [queryFailed, setQueryFailed] = useState(false);
  const [askNotes, setAskNotes] = useState<string[]>([]);
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [model, setModel] = useState('');
  const [fallback, setFallback] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Proposal | null>(null);
  const [unassign, setUnassign] = useState<Row | null>(null);
  const assigned = loaded.bls.filter(b => b.dealId === deal.dealId && b.deletedFlag !== 'X');
  const byNo = useMemo(() => new Map(loaded.bls.map(b => [b.blNo, b])), [loaded.bls]);
  const note = commodityNote(deal, loaded.commodities);
  const rules = useMemo(() => ({ ...aiRules, ...quickRules(chips) }), [aiRules, chips]);

  // Proposals as soon as the deal is chosen, and again whenever the preferences or the question's filters change.
  // The filters apply to the real deals and BLs here; the AI only reads the question and ranks what is found.
  useEffect(() => {
    let live = true;
    const reading = sent !== '';   // the question is being read: the first answer carries its filters, not proposals
    const targets = across ? loaded.deals.filter(d => d.status === 'Open' && dealMatches(d, criteria))
      : deal.status === 'Open' && dealMatches(deal, criteria) ? [deal] : [];
    if (across && !reading) {
      // Across deals every deal gets its own deterministic proposals; no AI ranking, no mixing of deals.
      const merged: Proposal[] = targets.flatMap(t => orderByRules(proposalsFor(t, loaded.bls, loaded.commodities, rules, criteria), rules, byNo).slice(0, 3).map(combo => ({ combo, reason: '', deal: t })))
        .sort((a, b) => Math.abs(a.combo.diffPct) - Math.abs(b.combo.diffPct) || a.combo.bls.length - b.combo.bls.length).slice(0, 12);
      void Promise.resolve().then(() => { if (live) { setProposals(merged); setModel(''); setFallback(''); } });
      return () => { live = false; };
    }
    if (!reading && !targets.length) {
      void Promise.resolve().then(() => { if (live) { setProposals([]); setFallback(''); } });
      return () => { live = false; };
    }
    if (deal.status !== 'Open') return;
    const pool = orderByRules(proposalsFor(deal, loaded.bls, loaded.commodities, rules, reading ? [] : criteria), rules, byNo).slice(0, 20);
    const used = [...new Set(pool.flatMap(c => c.bls))].map(no => byNo.get(no) ?? {});
    void Promise.resolve().then(() => { if (live) setBusy(true); });
    data.ai({
      deal: { dealId: deal.dealId, tsfCommodity: deal.tsfCommodity, dealUsd: deal.usd ?? '', remainingUsd: deal.remainingUsd },
      candidates: pool, preferences: sent,
      bls: used.map(b => ({ blNo: str(b.blNo), tfNo: str(b.tfNo), tfDate: str(b.tfDate), quantity: str(b.quantity), usdValue: str(b.usdValue) }))
    }).then(answer => {
      if (!live) return;
      const ai = answer.model !== 'none';
      setModel(answer.model);
      if (reading) {
        setAskNotes(answer.notUnderstood);
        if (!ai) { setProposals([]); setQueryFailed(true); return; }
        // The question's filters and rules apply from now on; the next round proposes under them.
        setQueryFailed(false);
        setAiRules(answer.rules); setCriteria(answer.criteria ?? []); setAcross(answer.acrossDeals === true);
        setSent('');
        if (!Object.keys(answer.rules).length && !(answer.criteria ?? []).length && answer.acrossDeals !== true) setProposals(pool.slice(0, 6).map(c => ({ combo: c, reason: '', deal })));
        return;
      }
      const ranked = ai ? answer.ranked.filter(r => pool[r.index]).map(r => ({ combo: pool[r.index], reason: r.reason, deal }))
        : pool.slice(0, 6).map(c => ({ combo: c, reason: '', deal }));
      setProposals(ranked.slice(0, 6));
      setFallback(ai ? '' : answer.ranked[0]?.reason ?? '');
    }, (e: Error) => { if (live) onError(e.message); }).finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [deal, loaded, data, rules, criteria, across, byNo, sent, onError]);

  const toggle = (id: string) => setChips(list => (list.includes(id) ? list.filter(c => c !== id)
    : [...list.filter(c => !(id === 'oneBl' && c === 'fewest') && !(id === 'fewest' && c === 'oneBl')), id]));
  const accept = async (p: Proposal) => {
    if (busy) return;   // a second click while the first is still writing
    setBusy(true);
    try {
      // The write re-reads the BLs from SAP and refuses a BL that is no longer free, a wrong commodity or an over-allocation.
      await data.assign(p.deal.dealId, acceptPlan(p.combo, loaded.bls), { dealUsd: p.deal.usd ?? '', tsfCommodity: p.deal.tsfCommodity, commodities: loaded.commodities });
      setOpen(null);
      onChanged(`${p.combo.bls.length} BL${p.combo.bls.length > 1 ? 's' : ''} assigned to ${p.deal.dealId}`);
    } catch (e) { setOpen(null); onStale((e as Error).message); } finally { setBusy(false); }
  };
  const doUnassign = async (b: Row) => {
    setBusy(true);
    try { await data.unassign(str(b.blNo)); setUnassign(null); onChanged(`BL ${str(b.blNo)} unassigned from ${deal.dealId}`); }
    catch (e) { onError((e as Error).message); } finally { setBusy(false); }
  };
  const pct = progressPct(deal);

  return (
    <>
      <div className="panel tsf-propose__hero">
        <div className="tsf-propose__hero-title">
          <p className="tsf-propose__eyebrow">Deal ID</p>
          <h2><span className="mono">{deal.dealId}</span> <TrafficLightTag tone={STATUS_TONE[deal.status]}>{deal.status}</TrafficLightTag></h2>
          <p className="tsf-propose__muted">{deal.dealDesc || '—'} · {deal.tsfCommodity || 'no commodity'}{deal.tsfCommodityText ? ` ${deal.tsfCommodityText}` : ''}</p>
        </div>
        <div className="tsf-propose__hero-figures">
          <div><span>Deal Amount</span><b>{formatAmount(deal.amount)} {deal.currency}</b><small>{usd(deal.usd)}</small></div>
          <div><span>Assigned</span><b>{usd(deal.assignedUsd)}</b><small>{assigned.length} BL{assigned.length === 1 ? '' : 's'}</small></div>
          <div className="accent"><span>Remaining</span><b>{usd(deal.remainingUsd || null)}</b><small>what the proposals aim at</small></div>
        </div>
        <div className="tsf-propose__progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Assigned share of the deal">
          <span style={{ width: `${pct}%` }} /><em>{pct}% assigned</em>
        </div>
      </div>
      {deal.status === 'No USD rate' && <Notice kind="warn">No USD rate for {deal.currency} today: this Deal ID gets no proposals until SAP has one (rate type M).</Notice>}
      {deal.status === 'Filled' && <Notice>This Deal ID is filled within 1%. Unassign a BL below to propose again.</Notice>}
      {note && <Notice kind="warn">{note}</Notice>}

      {deal.status === 'Open' && (
        <div className="panel tsf-propose__proposals">
          <div className="tsf-propose__proposals-head">
            <h3><Sparkles size={16} />Proposals {proposals && <span>{proposals.length}</span>}</h3>
            <div className="tsf-propose__chips" role="group" aria-label="Quick preferences">
              {QUICK.map(c => <button key={c.id} className={`tsf-propose__chip${chips.includes(c.id) ? ' on' : ''}`} aria-pressed={chips.includes(c.id)} onClick={() => toggle(c.id)}>{c.label}</button>)}
            </div>
          </div>
          <form className="tsf-propose__ask" onSubmit={e => { e.preventDefault(); if (typed.trim() && !busy) { setAiRules({}); setCriteria([]); setAcross(false); setQueryFailed(false); setAskNotes([]); setProposals(null); setSent(typed.trim()); } }}>
            <Wand2 size={15} />
            <input className="input" value={typed} onChange={e => setTyped(e.target.value)} aria-label="Preferences"
              placeholder="Ask the AI, e.g. deals with an amount greater than 50K, or keep trade flow 3000000016 out" />
            <button className="button small" disabled={busy || !typed.trim()}>Ask AI</button>
          </form>
          {(ruleChips(rules).length > 0 || criteria.length > 0 || across || askNotes.length > 0) && (
            <div className="tsf-propose__understood" aria-label="Applied criteria">
              {criteriaChips(criteria, across).map(c => <span key={c} className="tsf-propose__rule">{c}</span>)}
              {ruleChips(rules).map(c => <span key={c} className="tsf-propose__rule">{c}</span>)}
              {askNotes.map(n => <span key={n} className="tsf-propose__muted">Not applied: {n}</span>)}
            </div>
          )}
          {queryFailed && <Notice kind="warn">{askNotes[0] || 'The AI is not available.'} Your question was not applied, so no proposals are shown for it.</Notice>}
          {fallback && proposals && proposals.length > 0 && <p className="tsf-propose__fallback"><Sparkles size={13} />{fallback}</p>}
          {(busy || sent) && !proposals && <Loading text={sent ? 'Reading your question…' : 'Finding combinations…'} />}
          {proposals && !proposals.length && !queryFailed && (criteria.length > 0 || across
            ? <Notice kind="warn">{NO_MATCH}</Notice>
            : <Notice kind="warn">No combination of free BLs comes within 1% of {usd(deal.remainingUsd)}{ruleChips(rules).length ? ' under these preferences' : ''}.</Notice>)}
          {proposals && proposals.length > 0 && (
            <ol className={`tsf-propose__grid${busy ? ' busy' : ''}`}>
              {proposals.map((p, i) => {
                const rows = p.combo.bls.map(no => byNo.get(no) ?? {});
                const parts = contributions(rows.map(b => ({ blNo: str(b.blNo), usdValue: str(b.usdValue) })));
                const oldest = rows.map(r => str(r.tfDate)).sort()[0] ?? '';
                return (
                  <li key={`${p.deal.dealId}:${p.combo.bls.join('+')}`}>
                    <button className={`tsf-propose__card${i === 0 ? ' best' : ''}`} onClick={() => setOpen(p)} aria-label={`Proposal ${i + 1}: ${p.combo.bls.length} BLs, ${p.combo.totalUsd} USD`}>
                      <span className="tsf-propose__card-top">
                        <span className="tsf-propose__rank">{across ? p.deal.dealId : i === 0 ? 'Best match' : `Option ${i + 1}`}</span>
                        <span className={`tsf-propose__match${Math.abs(p.combo.diffPct) <= 0.1 ? ' exact' : ''}`}>{matchPct(p.combo.diffPct)}</span>
                      </span>
                      <span className="tsf-propose__total">{formatAmount(p.combo.totalUsd)} <small>USD</small></span>
                      <span className="tsf-propose__diff">{p.combo.diffPct > 0 ? '+' : ''}{p.combo.diffPct.toFixed(2)}% against {formatAmount(p.deal.remainingUsd)} USD left</span>
                      <span className="tsf-propose__stack" aria-hidden="true">{parts.map((s, k) => <span key={s.blNo} className={`c${k % 6}`} style={{ width: `${Math.max(s.pct, 2)}%` }} />)}</span>
                      <span className="tsf-propose__meta"><b>{p.combo.bls.length}</b> BL{p.combo.bls.length > 1 ? 's' : ''} · <b>{p.combo.tfs}</b> trade flow{p.combo.tfs > 1 ? 's' : ''}{oldest ? ` · oldest ${formatDate(oldest)}` : ''}</span>
                      {p.reason && <span className="tsf-propose__reason"><Sparkles size={12} />{p.reason}</span>}
                      <span className="tsf-propose__open">View details <ArrowRight size={14} /></span>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
          {model && model !== 'none' && !across && <p className="tsf-propose__muted">Ranked and explained by {model}. Every amount is calculated by the app.</p>}
        </div>
      )}

      <div className="panel tsf-propose__assigned">
        <h3>Assigned BLs <span>{assigned.length}</span></h3>
        {!assigned.length && <p className="tsf-propose__muted">None yet. Open a proposal and accept it to assign its BLs to {deal.dealId}.</p>}
        {assigned.length > 0 && <DataTable nativeLayout nativeExport aria-label="Assigned BLs">
          <thead><tr><th>BL No</th><th>Trade flow</th><th className="num">Quantity</th><th className="num">Assigned USD</th><th className="actions">Actions</th></tr></thead>
          <tbody>{assigned.map(b => <tr key={b.blNo}>
            <td className="mono">{b.blNo}</td><td className="mono">{b.tfNo} · {formatDate(str(b.tfDate))}</td>
            <td className="num">{fmtQty(str(b.quantity))}</td><td className="num">{formatAmount(str(b.assignedUsd))}</td>
            <td className="actions"><button className="button small secondary" disabled={busy} aria-label={`Unassign BL ${b.blNo}`} onClick={() => setUnassign(b)}><Undo2 size={14} />Unassign</button></td>
          </tr>)}</tbody>
        </DataTable>}
      </div>

      {open && <ProposalModal proposal={open} rank={(proposals ?? []).indexOf(open) + 1} deal={open.deal} bls={byNo} busy={busy} onClose={() => setOpen(null)} onAccept={() => accept(open)} />}
      {unassign && <ConfirmDialog title={`Unassign BL ${str(unassign.blNo)}?`} busy={busy} confirmLabel="Unassign"
        message={`The BL leaves ${deal.dealId} and can be proposed again; ${usd(str(unassign.assignedUsd))} becomes open on the deal.`}
        onClose={() => setUnassign(null)} onConfirm={() => doUnassign(unassign)} />}
    </>
  );
}
