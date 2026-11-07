// DE6 TSF FX Blotter: Auto-create Deals and Release to MO (pair) as they run against SAP (sap.ts).
import { useState } from 'react';
import { Search } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { DialogSection } from '@/components/ui/DialogSection';
import { WizardSteps } from '@/components/ui/WizardSteps';
import { AmountInput } from '@/components/fields/AmountInput';
import { FxTable, type FxColumn } from '@/pages/fx/FxTable';
import { amt, date, rate } from '@/pages/fx/format';
import { modelOf } from '@/ref/features/fx-blotter/data';
import { MODES, modelLabel, typeLabel, type BlotterRow } from './data';
import { Facts } from './InfoDialogs';
import { useMasters } from './masters';
import { num, pairIssues, rateNum, usdOf } from './logic';
import {
  autoEligible, autoLegs, bookAutoDeal, isNdfType, isoOfDate, mcBalance, orderLegs, pairReleaseProblem, realDealId, recalcAutoLeg, releasePair,
  sapMessage, validateAutoLegs, type AutoLeg, type AutoMasters, type AutoOutcome, type MasterContract, type ReleaseOutcome, type Trader
} from './sap';

const dateOf = (s: string): Date | null => { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
/** The contracts a search keeps: MC number, model, commodity, currency pair or entity string. */
const matching = (list: MasterContract[], q: string) => {
  const t = q.trim().toLowerCase();
  return t ? list.filter(m => [m.mcNumber, m.fxModel, m.commodityCode, m.commodityDesc, m.currPair, m.entities.join('-')].join(' ').toLowerCase().includes(t)) : list;
};
const McSearch = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
  <label className="search ds-search tsf-mc-search"><Search size={14} /><input aria-label="Search master contracts" placeholder="Search MC number, model, commodity…" value={value} onChange={e => onChange(e.target.value)} /></label>
);
const Check = ({ issues, ok }: { issues: string[]; ok: string }) => (
  <>{issues.length ? issues.map(i => <div key={i} className="tsf-check bad" role="alert">{i}</div>) : <div className="tsf-check">{ok}</div>}</>
);

const mcCols: FxColumn<MasterContract>[] = [
  { id: 'mc', label: 'MC Ref No', kind: 'code', value: m => m.mcNumber },
  { id: 'model', label: 'FX Model', value: m => modelLabel(m.fxModel) || m.fxModel },
  { id: 'com', label: 'Commodity', value: m => m.commodityDesc || m.commodityCode },
  { id: 'pair', label: 'Currency Pair', value: m => m.currPair },
  { id: 'ent', label: 'Entity String', value: m => m.entities.join('-') },
  { id: 'av', label: 'Available (USD)', kind: 'amount', value: m => mcBalance(m), render: m => amt(mcBalance(m)) }
];

/** Auto-create Deals: Deal 1 and Deal 2 of a master contract, booked in SAP on OK (status 01, no Deal ID yet). */
export function SapAutoDealDialog({ masters, blotterDate, trader, onDone, onClose }: {
  masters: AutoMasters; blotterDate: string; trader: Trader | null; onDone: (o: AutoOutcome, mc: MasterContract) => void; onClose: () => void;
}) {
  const { banks, bankText, companyText } = useMasters();
  const [origin, setOrigin] = useState(masters.origins[0] ?? '');
  const [mc, setMc] = useState<MasterContract | null>(null);
  const [legs, setLegs] = useState<AutoLeg[]>([]);
  const [picker, setPicker] = useState(false);
  const [mcQuery, setMcQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const eligible = autoEligible(masters.contracts, origin);
  const msgs = mc && legs.length ? validateAutoLegs(mc, legs) : [];
  const choose = (m: MasterContract) => { setMc(m); setLegs(autoLegs(m, blotterDate)); setPicker(false); setError(''); };
  const set = (i: number, p: Partial<AutoLeg>, recalc = true) => {
    setLegs(ls => ls.map((l, k) => (k === i ? (recalc ? recalcAutoLeg({ ...l, ...p }) : { ...l, ...p }) : l)));
    setError('');
  };
  const submit = async () => {
    if (!mc) { setError('Select a Master Contract (MC Ref No).'); return; }
    if (!trader) { setError('Choose your Trader / Trade Code above the grid first: the deals are booked under that trader.'); return; }
    if (!legs.length) { setError(`Master contract ${mc.mcNumber} has no FX model rule for its two legs.`); return; }
    if (msgs.length) { setError(msgs[0]); return; }
    setBusy(true);
    try { onDone(await bookAutoDeal(mc, legs, blotterDate, trader), mc); }
    catch (e) { setError(sapMessage(e)); setBusy(false); }
  };
  const partners = [...new Map([...banks.map(b => [b.code, b.text] as const), ...legs.map(l => [l.partner, bankText(l.partner)] as const)]).entries()];
  const block = (l: AutoLeg, i: number) => {
    const ndf = isNdfType(l.txnType);
    return (
      <DialogSection key={l.leg} title={l.leg} description={`${companyText(l.entity)} (${l.entity}) · ${typeLabel(l.txnType) || l.txnType} · ${l.bs === 'B' ? 'Buy' : 'Sell'} ${l.curr1} / ${l.bs2 === 'B' ? 'Buy' : 'Sell'} ${l.curr2}`}>
        <div className="tsf-fields">
          <label className="tsf-field">Trade Date*<input type="date" value={isoOfDate(l.tradeDate)} onChange={e => set(i, { tradeDate: dateOf(e.target.value) }, false)} /></label>
          <label className="tsf-field">Value Date*<input type="date" value={isoOfDate(l.valueDate)} onChange={e => set(i, { valueDate: dateOf(e.target.value), fixingDate: null })} /></label>
          <label className="tsf-field">Partner*<select value={l.partner} onChange={e => set(i, { partner: e.target.value }, false)}>{partners.map(([c, t]) => <option key={c} value={c}>{t === c ? c : `${c} - ${t}`}</option>)}</select></label>
          <div className="tsf-field"><span>Amount 1 ({l.curr1})*</span><AmountInput bare value={l.amt1 ? String(l.amt1) : ''} label={`${l.leg} Amount 1`} onValue={v => set(i, { amt1: num(v) })} /></div>
          <label className="tsf-field">All in Rate*<input inputMode="decimal" aria-label={`${l.leg} All in Rate`} value={l.rate ? String(l.rate) : ''} placeholder="Enter the dealt rate" onChange={e => set(i, { rate: rateNum(e.target.value) })} /></label>
          <label className="tsf-field">Swap<input inputMode="decimal" value={l.swap ? String(l.swap) : ''} onChange={e => set(i, { swap: rateNum(e.target.value) })} /></label>
          <label className="tsf-field">Spot<input readOnly value={rate(l.spot)} /></label>
          <label className="tsf-field">Amount 2 ({l.curr2})<input readOnly value={amt(l.amt2)} /></label>
          <label className="tsf-field">Mode of Trade<select value={l.mode} onChange={e => set(i, { mode: e.target.value }, false)}>{MODES.map(m => <option key={m}>{m}</option>)}</select></label>
          {ndf && <label className="tsf-field">NDF Fixing Date<input type="date" value={isoOfDate(l.fixingDate)} onChange={e => set(i, { fixingDate: dateOf(e.target.value) }, false)} /></label>}
          {ndf && <label className="tsf-field">NDF Fixing Ref<select value={l.fixRef} onChange={e => set(i, { fixRef: e.target.value }, false)}><option value="">—</option>{masters.fixRefs.map(f => <option key={f}>{f}</option>)}</select></label>}
        </div>
      </DialogSection>
    );
  };
  return (
    <Modal size="wide" title="Auto-create Deals" subtitle="Book Deal 1 and Deal 2 of a Master Contract in SAP. The Deal ID is created when you release both to MO." busy={busy} onClose={onClose}
      footer={<><button className="button secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="button" disabled={busy || !mc} onClick={() => { void submit(); }}>{busy ? 'Creating in SAP…' : 'Create Deals in SAP'}</button></>}>
      {error && <div className="tsf-check bad" role="alert">{error}</div>}
      <DialogSection title="Master Contract">
        <div className="tsf-fields">
          <label className="tsf-field">Origin Entity<select value={origin} onChange={e => { setOrigin(e.target.value); setMc(null); setLegs([]); }}>{masters.origins.map(c => <option key={c} value={c}>{c} - {companyText(c)}</option>)}</select></label>
          <div className="tsf-field"><span>MC Ref No*</span><div className="bl-pick"><input readOnly aria-label="MC Ref No" value={mc?.mcNumber ?? ''} placeholder="Select a master contract" /><button type="button" className="button secondary small" onClick={() => setPicker(true)}>Select</button></div></div>
          <label className="tsf-field">Trader<input readOnly value={trader ? `${trader.code} · ${trader.name}` : 'Choose a trader above the grid'} /></label>
        </div>
        {mc && <Facts items={[['FX Model', modelLabel(mc.fxModel) || mc.fxModel], ['MC Amount (USD)', amt(mc.amtUSD)], ['Available (USD)', amt(mcBalance(mc))], ['Currency Pair', mc.currPair], ['Entity String', mc.entities.join('-')], ['Shipping', `${date(isoOfDate(mc.shipStart))} – ${date(isoOfDate(mc.shipEnd))}`]]} />}
        {mc && !legs.length && <div className="tsf-check bad" role="alert">The FX model {mc.fxModel} of this contract has no rule for its two legs (RULE_BT).</div>}
      </DialogSection>
      {legs.map(block)}
      {mc && legs.length > 0 && <Check issues={msgs} ok="Both deals are ready to be created in SAP." />}
      {picker && <Modal size="wide" title="View Master Contracts" subtitle={`Contracts of origin ${origin} with an available balance (status 03 / 04).`} onClose={() => setPicker(false)} footer={<button className="button secondary" onClick={() => setPicker(false)}>Close</button>}>
        <McSearch value={mcQuery} onChange={setMcQuery} />
        <FxTable label="Master contracts" columns={mcCols} rows={matching(eligible, mcQuery)} rowKey={m => m.mcNumber} select="single" picked={mc ? [mc.mcNumber] : []}
          onPick={k => { const m = eligible.find(x => x.mcNumber === k[0]); if (m) choose(m); }} onOpen={choose} pageSizes={[10]} empty={`No master contract of ${origin} has a balance left.`} />
        <p className="tsf-sample">Click a row, or double-click it, to choose the master contract.</p>
      </Modal>}
    </Modal>
  );
}

const legCols: FxColumn<BlotterRow & { leg: string }>[] = [
  { id: 'leg', label: 'Leg', kind: 'code', value: r => r.leg },
  { id: 'ref', label: 'Transaction', kind: 'code', value: r => r.ref },
  { id: 'ent', label: 'Company', value: r => r.company },
  { id: 'type', label: 'Type', value: r => r.txnType },
  { id: 'bs', label: 'B/S', value: r => r.bs1 },
  { id: 'pair', label: 'Currencies', value: r => `${r.cur1}/${r.cur2}` },
  { id: 'a1', label: 'Amount 1', kind: 'amount', value: r => num(r.amount1), render: r => amt(num(r.amount1)) },
  { id: 'rate', label: 'Rate', kind: 'rate', value: r => rateNum(r.rate), render: r => rate(rateNum(r.rate)) },
  { id: 'vd', label: 'Value Date', kind: 'date', value: r => r.valueDate, render: r => date(r.valueDate) },
  { id: 'mc', label: 'MC Ref', kind: 'code', value: r => r.mc }
];

/** Release to MO for two transactions: a new Deal ID from the number range, or the one they already carry. */
export function SapPairDialog({ rows, contracts, blotterDate, trader, onDone, onClose }: {
  rows: BlotterRow[]; contracts: MasterContract[]; blotterDate: string; trader: Trader | null; onDone: (o: ReleaseOutcome) => void; onClose: () => void;
}) {
  const [swapped, setSwapped] = useState(false);
  const pre = orderLegs(rows);
  const existing = realDealId(pre[0].dealId);
  const ownMc = pre.map(r => r.mc).find(Boolean) ?? '';
  const [mcNo, setMcNo] = useState(ownMc);
  const [mcQuery, setMcQuery] = useState('');
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mc = contracts.find(m => m.mcNumber === mcNo);
  // Deal 1 is the leg the contract's FX model books first; Swap exchanges them for a manual pair.
  const auto = orderLegs(rows, mc);
  const ordered = (swapped ? [auto[1], auto[0]] : auto).map((r, i) => ({ ...r, leg: i === 0 ? 'Deal 1' : 'Deal 2' }));
  const problem = pairReleaseProblem(rows);
  const issues = pairIssues(ordered[0], ordered[1]);
  const blocking = [problem, ...issues.filter(i => /Currency pairs/.test(i))].filter(Boolean);
  const warnings = issues.filter(i => !/Currency pairs/.test(i));
  const tolPct = (mc && modelOf(mc.fxModel)?.tolerancePct) || 5;
  const usd = Math.max(...ordered.map(usdOf));
  const tol = mc && !existing && usd > mcBalance(mc) * (1 + tolPct / 100) ? [`Leg amount ${amt(usd)} USD exceeds the balance of ${mc.mcNumber} (${amt(mcBalance(mc))} USD) plus ${tolPct}% tolerance.`] : [];
  const eligible = contracts.filter(m => mcBalance(m) > 0 || m.mcNumber === ownMc);
  const steps = existing ? ['Check legs', 'Release'] : ['Check legs', 'Master contract', 'Generate Deal ID'];
  const last = steps.length - 1;
  const canNext = step === 0 ? blocking.length === 0 : step === 1 && !existing ? Boolean(mc) && tol.length === 0 : true;
  const go = async () => {
    if (!trader) { setError('Choose your Trader / Trade Code above the grid first: the Deal ID is created under that trader.'); return; }
    setBusy(true); setError('');
    try { onDone(await releasePair(rows, mc, blotterDate, trader, [ordered[0], ordered[1]])); }
    catch (e) { setError(sapMessage(e)); setBusy(false); }
  };
  return (
    <Modal size="wide" title={existing ? `Release to MO under Deal ID ${existing}` : 'Master Contract Assignment & New Deal ID'}
      subtitle={existing ? 'Both legs already carry their Deal ID: they are released to the Mid Office (status 03).' : 'Release Deal 1 and Deal 2 under a Master Contract with a new Deal ID.'}
      busy={busy} onClose={onClose}
      footerStart={step > 0 ? <button className="button secondary" disabled={busy} onClick={() => setStep(step - 1)}>Back</button> : undefined}
      footer={<><button className="button secondary" disabled={busy} onClick={onClose}>Cancel</button>
        {step < last ? <button className="button" disabled={!canNext} onClick={() => setStep(step + 1)}>Next</button>
          : <button className="button" disabled={busy || (!existing && !mc)} onClick={() => { void go(); }}>{busy ? 'Releasing…' : existing ? 'Release to MO' : 'Generate Deal ID & Release'}</button>}</>}>
      <WizardSteps steps={steps} current={step} />
      {error && <div className="tsf-check bad" role="alert">{error}</div>}
      {step === 0 && <DialogSection title="Legs" description="Deal 1 is the leg the master contract's FX model books first; swap them if this pair is the other way round.">
        <FxTable label="Legs" columns={legCols} rows={ordered} rowKey={r => r.id} pageSizes={[10]} empty="No legs." />
        <Check issues={blocking} ok="Both legs can be released together." />
        {!existing && <button type="button" className="button secondary small" onClick={() => setSwapped(x => !x)}>Swap Deal 1 / Deal 2</button>}
        {warnings.map(w => <div key={w} className="tsf-check warn">{w}</div>)}
      </DialogSection>}
      {step === 1 && !existing && <DialogSection title="Master contract" description={ownMc ? `The legs were created for ${ownMc}.` : 'Pick the master contract of the Deal ID.'}>
        <McSearch value={mcQuery} onChange={setMcQuery} />
        <FxTable label="Eligible master contracts" columns={mcCols} rows={matching(eligible, mcQuery)} rowKey={m => m.mcNumber} select="single" picked={mcNo ? [mcNo] : []} onPick={k => setMcNo(k[0] ?? '')} pageSizes={[10]} empty="No master contract with a balance left." />
        {mc && <Check issues={tol} ok={`Tolerance check passed. Remaining balance after this deal: ${amt(mcBalance(mc) - usd)} USD.`} />}
      </DialogSection>}
      {step === last && <DialogSection title={existing ? 'Release' : 'Generate Deal ID'}>
        <Facts items={[['Deal ID', existing || 'Drawn from number range ZSGTSFNR01 on release'], ['Master Contract', existing ? (ownMc || '–') : (mc?.mcNumber ?? '–')], ['Deal 1', `${ordered[0].ref} · ${ordered[0].company}`], ['Deal 2', `${ordered[1].ref} · ${ordered[1].company}`], ['Trader', trader ? `${trader.code} · ${trader.name}` : 'Choose a trader above the grid']]} />
        <div className="tsf-check warn">{existing ? 'Both legs move to status 03 (FO → MO Unmatched).' : 'SAP and the middleware are updated: the Deal ID is created, the master contract moves to 04 (In Use) and both legs move to status 03 (FO → MO Unmatched).'}</div>
      </DialogSection>}
    </Modal>
  );
}
