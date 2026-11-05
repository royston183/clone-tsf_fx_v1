// Propose Tradeflows: each Deal ID with what is left of it in USD, and proposals of unassigned BLs of its commodity
// that add up to that amount (±1%). The app finds the combinations; the AI ranks them, explains them and turns the
// person's preferences into rules (design 2026-11-05-manage-propose-tradeflows). Accept writes the Deal ID on the BLs.
import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Server, Sparkles, Undo2 } from 'lucide-react';
import { TrafficLightTag } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Loading } from '@/components/ui/Loading';
import { Notice } from '@/components/ui/Notice';
import { Toast, useToast } from '@/components/ui/Toast';
import { formatAmount, formatDate } from '@/lib/fields/parse';
import { str } from '@/lib/grid/grid';
import type { Row } from '@/lib/grid/types';
import { rankByCloseness, type Combination, type Rules } from '@/lib/propose/match';
import { fmtQty } from '@/pages/manage-tradeflows/logic';
import { sampleProposeData, type AiAnswer, type ProposeData } from './data';
import { acceptPlan, commodityNote, dealRows, proposalsFor, ruleChips, type DealRow } from './logic';
import './propose.css';

interface Loaded { deals: DealRow[]; bls: Row[]; commodities: Row[]; rates: Record<string, string> }
interface Proposal { combo: Combination; reason: string }
const usd = (v: string | null) => (v === null || v === '' ? '—' : `${formatAmount(v)} USD`);
export default function ProposeTradeflowsPage() {
  // Sample data until the live sources are connected (Part B: liveProposeData).
  const data = useMemo(() => sampleProposeData(), []);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState('');
  const [toast, notify] = useToast();

  useEffect(() => {
    let live = true;
    Promise.all([data.deals(), data.bls(), data.commodities(), data.rates()]).then(([deals, bls, commodities, rates]) => {
      if (live) setLoaded({ deals: dealRows(deals, bls, rates), bls, commodities, rates });
    }, (e: Error) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [data, reload]);

  const deal = loaded?.deals.find(d => d.dealId === selected) ?? null;
  return (
    <section className="panel ds-app tsf-propose">
      <div className="ds-toolbar">
        <div className="ds-title">
          <h2>Deal IDs</h2>
          <TrafficLightTag tone={data.sample ? 'amber' : 'green'}><Server size={11} />{data.sample ? 'Sample data' : 'SAP + SLC middleware'}</TrafficLightTag>
        </div>
      </div>
      {data.sample && <Notice>Running on sample data: Deal IDs, BLs and rates are examples, and the AI is not connected yet.</Notice>}
      {error && <Notice error><AlertCircle size={16} />{error}</Notice>}
      {!loaded && !error && <Loading text="Loading Deal IDs and BLs…" />}
      {loaded && (
        <div className="tsf-propose__layout">
          <div className="tsf-propose__deals">
            <table className="ds-table">
              <thead><tr><th>Deal ID</th><th>Commodity</th><th className="num">Deal Amount</th><th className="num">Remaining USD</th><th>Status</th></tr></thead>
              <tbody>{loaded.deals.map(d => (
                <tr key={d.dealId} className={d.dealId === selected ? 'selected' : ''} onClick={() => setSelected(d.dealId)}>
                  <td><button className="link mono" onClick={() => setSelected(d.dealId)} aria-pressed={d.dealId === selected}>{d.dealId}</button></td>
                  <td>{d.tsfCommodity}{d.tsfCommodityText ? ` - ${d.tsfCommodityText}` : ''}</td>
                  <td className="num">{formatAmount(d.amount)} {d.currency}</td>
                  <td className="num">{d.remainingUsd ? formatAmount(d.remainingUsd) : '—'}</td>
                  <td><TrafficLightTag tone={d.status === 'Open' ? 'amber' : d.status === 'Filled' ? 'green' : 'red'}>{d.status}</TrafficLightTag></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="tsf-propose__detail">
            {!deal && <p className="tsf-propose__empty">Choose a Deal ID to see its BLs and get proposals.</p>}
            {deal && <DealPanel key={deal.dealId} deal={deal} loaded={loaded} data={data}
              onChanged={text => { notify(text, 'success'); setReload(r => r + 1); }} onError={text => notify(text, 'error')} />}
          </div>
        </div>
      )}
      <Toast toast={toast} />
    </section>
  );
}

function DealPanel({ deal, loaded, data, onChanged, onError }: { deal: DealRow; loaded: Loaded; data: ProposeData; onChanged: (t: string) => void; onError: (t: string) => void }) {
  const [preferences, setPreferences] = useState('');
  const [rules, setRules] = useState<Rules>({});
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [notUnderstood, setNotUnderstood] = useState<string[]>([]);
  const [model, setModel] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Proposal | null>(null);
  const [unassign, setUnassign] = useState<Row | null>(null);
  const assigned = loaded.bls.filter(b => b.dealId === deal.dealId && b.deletedFlag !== 'X');
  const byNo = useMemo(() => new Map(loaded.bls.map(b => [b.blNo, b])), [loaded.bls]);
  const note = commodityNote(deal, loaded.commodities);

  const ask = async (current: Rules, prefs: string): Promise<{ answer: AiAnswer; pool: Combination[] }> => {
    const pool = rankByCloseness(proposalsFor(deal, loaded.bls, loaded.commodities, current)).slice(0, 20);
    const used = [...new Set(pool.flatMap(c => c.bls))].map(no => byNo.get(no) ?? {});
    const answer = await data.ai({
      deal: { dealId: deal.dealId, tsfCommodity: deal.tsfCommodity, dealUsd: deal.usd ?? '', remainingUsd: deal.remainingUsd },
      candidates: pool, preferences: prefs,
      bls: used.map(b => ({ blNo: str(b.blNo), tfNo: str(b.tfNo), tfDate: str(b.tfDate), quantity: str(b.quantity), usdValue: str(b.usdValue) }))
    });
    return { answer, pool };
  };
  const find = async () => {
    setBusy(true);
    try {
      let { answer, pool } = await ask(rules, preferences);
      // The AI turned the preferences into rules: find the combinations again under them, and let it rank those.
      const next = { ...rules, ...answer.rules };
      if (JSON.stringify(next) !== JSON.stringify(rules)) ({ answer, pool } = await ask(next, preferences).then(r => ({ answer: { ...r.answer, rules: answer.rules, notUnderstood: answer.notUnderstood }, pool: r.pool })));
      setRules(next);
      setNotUnderstood(answer.notUnderstood);
      setModel(answer.model);
      setProposals(answer.ranked.filter(r => pool[r.index]).slice(0, 5).map(r => ({ combo: pool[r.index], reason: r.reason })));
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const accept = async (p: Proposal) => {
    setBusy(true);
    try {
      await data.assign(deal.dealId, acceptPlan(p.combo, loaded.bls));
      setConfirm(null);
      onChanged(`${p.combo.bls.length} BL${p.combo.bls.length > 1 ? 's' : ''} assigned to ${deal.dealId}`);
    } catch (e) { onError((e as Error).message); } finally { setBusy(false); }
  };
  const doUnassign = async (b: Row) => {
    setBusy(true);
    try { await data.unassign(str(b.blNo)); setUnassign(null); onChanged(`BL ${str(b.blNo)} unassigned from ${deal.dealId}`); }
    catch (e) { onError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="tsf-propose__panel">
      <header>
        <p className="tsf-propose__eyebrow">Deal ID</p>
        <h3>{deal.dealId} <span>{deal.dealDesc}</span></h3>
        <dl className="tsf-propose__facts">
          <div><dt>Deal Amount</dt><dd>{formatAmount(deal.amount)} {deal.currency}</dd></div>
          <div><dt>In USD</dt><dd>{usd(deal.usd)}</dd></div>
          <div><dt>Assigned</dt><dd>{usd(deal.assignedUsd)}</dd></div>
          <div><dt>Remaining</dt><dd className="strong">{usd(deal.remainingUsd || null)}</dd></div>
        </dl>
      </header>
      {deal.status === 'No USD rate' && <Notice kind="warn">No USD rate for {deal.currency} today: this Deal ID gets no proposals until SAP has one (rate type M).</Notice>}
      {note && <Notice kind="warn">{note}</Notice>}

      <section className="tsf-propose__section">
        <h4>Assigned BLs <span>{assigned.length}</span></h4>
        {!assigned.length && <p className="tsf-propose__muted">None yet.</p>}
        {assigned.length > 0 && <table className="ds-table"><thead><tr><th>BL No</th><th>Trade flow</th><th className="num">Quantity</th><th className="num">Assigned USD</th><th /></tr></thead>
          <tbody>{assigned.map(b => <tr key={b.blNo}>
            <td className="mono">{b.blNo}</td><td className="mono">{b.tfNo} · {formatDate(str(b.tfDate))}</td>
            <td className="num">{fmtQty(str(b.quantity))}</td><td className="num">{formatAmount(str(b.assignedUsd))}</td>
            <td className="actions"><button className="button small secondary" disabled={busy} aria-label={`Unassign BL ${b.blNo}`} onClick={() => setUnassign(b)}><Undo2 size={14} />Unassign</button></td>
          </tr>)}</tbody></table>}
      </section>

      <section className="tsf-propose__section">
        <h4>Proposals</h4>
        <label className="tsf-propose__prefs">
          <span>Your preferences (optional)</span>
          <textarea className="input" rows={2} value={preferences} placeholder="e.g. prefer older BLs, at most 3 BLs, keep trade flow 3000000016 out"
            onChange={e => setPreferences(e.target.value)} aria-label="Preferences" />
        </label>
        <div className="tsf-propose__ask">
          <button className="button" disabled={busy || deal.status !== 'Open'} onClick={find}><Sparkles size={15} />{busy ? 'Working…' : proposals ? 'Find again' : 'Find proposals'}</button>
          {ruleChips(rules).map(c => <span key={c} className="tsf-propose__chip">{c}</span>)}
        </div>
        {notUnderstood.map(n => <p key={n} className="tsf-propose__muted">Not understood: {n}</p>)}
        {proposals && !proposals.length && <Notice kind="warn">No combination of free BLs comes within 1% of {usd(deal.remainingUsd)}{ruleChips(rules).length ? ' under these preferences' : ''}.</Notice>}
        {proposals && proposals.length > 0 && <ol className="tsf-propose__cards">{proposals.map((p, i) => (
          <li key={p.combo.bls.join('+')} className="tsf-propose__card">
            <div className="tsf-propose__card-head">
              <span className="tsf-propose__rank">{i + 1}</span>
              <div className="tsf-propose__figures">
                <b>{usd(p.combo.totalUsd)}</b>
                <span className={Math.abs(p.combo.diffPct) <= 0.1 ? 'exact' : ''}>{p.combo.diffPct > 0 ? '+' : ''}{p.combo.diffPct.toFixed(2)}%</span>
                <span>{p.combo.bls.length} BL{p.combo.bls.length > 1 ? 's' : ''} · {p.combo.tfs} trade flow{p.combo.tfs > 1 ? 's' : ''}</span>
              </div>
              <button className="button small" disabled={busy} onClick={() => setConfirm(p)}><Check size={14} />Accept</button>
            </div>
            <p className="tsf-propose__reason"><Sparkles size={13} />{p.reason}</p>
            <ul className="tsf-propose__bls">{p.combo.bls.map(no => { const b = byNo.get(no) ?? {}; return (
              <li key={no}><span className="mono">{no}</span><span>{str(b.tfNo)} · {formatDate(str(b.tfDate))}</span><span className="num">{fmtQty(str(b.quantity))}</span><span className="num">{formatAmount(str(b.usdValue))} USD</span></li>
            ); })}</ul>
          </li>
        ))}</ol>}
        {model && model !== 'none' && <p className="tsf-propose__muted">Ranked by {model}. Amounts are calculated by the app.</p>}
      </section>

      {confirm && <ConfirmDialog title={`Assign ${confirm.combo.bls.length} BLs to ${deal.dealId}?`} busy={busy} confirmLabel="Assign"
        message={`BLs ${confirm.combo.bls.join(', ')} (${usd(confirm.combo.totalUsd)}) get Deal ID ${deal.dealId}. ${usd(deal.remainingUsd)} is left before; about ${usd((Number(deal.remainingUsd) - Number(confirm.combo.totalUsd)).toFixed(2))} after.`}
        onClose={() => setConfirm(null)} onConfirm={() => accept(confirm)} />}
      {unassign && <ConfirmDialog title={`Unassign BL ${str(unassign.blNo)}?`} busy={busy} confirmLabel="Unassign"
        message={`The BL leaves ${deal.dealId} and can be proposed again; ${usd(str(unassign.assignedUsd))} becomes open on the deal.`}
        onClose={() => setUnassign(null)} onConfirm={() => doUnassign(unassign)} />}
    </div>
  );
}
