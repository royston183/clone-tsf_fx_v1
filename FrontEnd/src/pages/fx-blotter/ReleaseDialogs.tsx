// Release to MO popups and the Auto-create Deals popup of the FX Blotter.
import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { DialogSection } from '@/components/ui/DialogSection';
import { WizardSteps } from '@/components/ui/WizardSteps';
import { AmountInput } from '@/components/fields/AmountInput';
import { FxTable, type FxColumn } from '@/pages/fx/FxTable';
import { addDays, amt, date, rate, workingDay } from '@/pages/fx/format';
import { BASE_RATES } from '@/pages/fx/sample';
import { MODES, FIX_REFS, modelLabel, typeLabel, type BlotterRow, type Mc, type OpenDeal } from './data';
import { Facts } from './InfoDialogs';
import { useMasters } from './masters';
import { amount2, assignIssues, mcBalance, num, pairIssues, rateNum, toleranceIssue, usdOf } from './logic';

const legCols: FxColumn<BlotterRow>[] = [
  { id: 'leg', label: 'Leg', kind: 'code', value: r => r.id, render: r => r.dealType || 'Leg' },
  { id: 'ref', label: 'RFHA', kind: 'code', value: r => r.ref },
  { id: 'ent', label: 'Entity', value: r => r.company },
  { id: 'bs', label: 'B/S', value: r => r.bs1 },
  { id: 'c1', label: 'Curr 1', value: r => r.cur1 },
  { id: 'a1', label: 'Amount 1', kind: 'amount', value: r => num(r.amount1), render: r => amt(num(r.amount1)) },
  { id: 'rate', label: 'Rate', kind: 'rate', value: r => rateNum(r.rate), render: r => rate(rateNum(r.rate)) },
  { id: 'vd', label: 'Value Date', kind: 'date', value: r => r.valueDate, render: r => date(r.valueDate) }
];
const legsFor = (rows: BlotterRow[]) => rows.map((r, i) => ({ ...r, dealType: `Leg ${i + 1}` }));
const Check = ({ issues, ok }: { issues: string[]; ok: string }) => (
  <>{issues.length ? issues.map(i => <div key={i} className="tsf-check bad" role="alert">{i}</div>) : <div className="tsf-check">{ok}</div>}</>
);

export function AssignDialog({ row, deals, mcs, onConfirm, onClose }: { row: BlotterRow; deals: OpenDeal[]; mcs: Mc[]; onConfirm: (deal: OpenDeal) => void; onClose: () => void }) {
  const { companyText } = useMasters();
  const [picked, setPicked] = useState<string[]>([]);
  const deal = deals.find(d => d.dealId === picked[0]);
  const issues = deal ? assignIssues(row, mcs.find(m => m.mc === deal.mc)) : [];
  const cols: FxColumn<OpenDeal>[] = [
    { id: 'id', label: 'Deal ID', kind: 'code', value: d => d.dealId }, { id: 'mc', label: 'MC', kind: 'code', value: d => d.mc },
    { id: 'model', label: 'Model', value: d => modelLabel(d.model) }, { id: 'type', label: 'Type', value: d => d.type }, { id: 'legs', label: 'Legs', kind: 'number', value: d => d.legs }
  ];
  return (
    <Modal size="wide" title="Assign to Existing Deal ID" subtitle={`${row.ref} - ${row.txnType} ${row.cur1}/${row.cur2}`} onClose={onClose}
      footer={<><button className="button secondary" onClick={onClose}>Cancel</button><button className="button" disabled={!deal || issues.length > 0} onClick={() => deal && onConfirm(deal)}>Assign &amp; Release</button></>}>
      <DialogSection title="Selected transaction">
        <Facts items={[['RFHA', row.ref], ['Company Code', `${row.company} - ${companyText(row.company)}`], ['Buy / Sell', row.bs1], [`Amount 1 (${row.cur1})`, amt(num(row.amount1))], [`Amount 2 (${row.cur2})`, amt(amount2(row))], ['All in Rate', rate(rateNum(row.rate))], ['Value Date', date(row.valueDate)]]} />
      </DialogSection>
      <DialogSection title="Open Deal IDs" description="Pick the Deal ID this leg joins.">
        <FxTable label="Open Deal IDs" columns={cols} rows={deals} rowKey={d => d.dealId} select="single" picked={picked} onPick={setPicked} pageSizes={[10]} empty="No open Deal IDs." />
        {deal && <Check issues={issues} ok="Deal ID compatibility check passed." />}
      </DialogSection>
    </Modal>
  );
}

export function PairWizard({ rows, mcs, nextDealId, onConfirm, onClose }: { rows: BlotterRow[]; mcs: Mc[]; nextDealId: string; onConfirm: (mc: Mc) => void; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const legs = legsFor(rows);
  const pair = pairIssues(rows[0], rows[1]);
  const mc = mcs.find(m => m.mc === picked[0]);
  const tol = mc ? rows.map(r => toleranceIssue(usdOf(r), mc)).filter((x): x is string => Boolean(x)) : [];
  const eligible = mcs.filter(m => mcBalance(m) > 0);
  const cols: FxColumn<Mc>[] = [
    { id: 'mc', label: 'MC', kind: 'code', value: m => m.mc }, { id: 'model', label: 'Model', value: m => modelLabel(m.model) }, { id: 'ent', label: 'Entity String', value: m => m.entityString },
    { id: 'win', label: 'Ship Window', value: m => m.shipStart, render: m => `${date(m.shipStart)} – ${date(m.shipEnd)}` },
    { id: 'bal', label: 'Balance (USD)', kind: 'amount', value: m => mcBalance(m), render: m => amt(mcBalance(m)) }
  ];
  const after = mc ? mcBalance(mc) - Math.max(...rows.map(usdOf)) : 0;
  const canNext = step === 0 ? pair.length === 0 : step === 1 ? Boolean(mc) && tol.length === 0 : true;
  return (
    <Modal size="wide" title="Master Contract Assignment & New Deal ID" subtitle="Release a D1/D2 pair under a Master Contract." onClose={onClose}
      footerStart={step > 0 ? <button className="button secondary" onClick={() => setStep(step - 1)}>Back</button> : undefined}
      footer={<><button className="button secondary" onClick={onClose}>Cancel</button>
        {step < 2 ? <button className="button" disabled={!canNext} onClick={() => setStep(step + 1)}>Next</button>
          : <button className="button" disabled={!mc} onClick={() => mc && onConfirm(mc)}>Generate Deal ID &amp; Release</button>}</>}>
      <WizardSteps steps={['Check legs', 'Choose master contract', 'Generate Deal ID']} current={step} />
      {step === 0 && <DialogSection title="Legs" description="Both legs must be opposite sides of the same currency pair.">
        <FxTable label="Legs" columns={legCols} rows={legs} rowKey={r => r.id} pageSizes={[10]} empty="No legs." />
        <Check issues={pair} ok="Pair check passed: opposite sides of the same currency pair, value dates within tolerance." />
      </DialogSection>}
      {step === 1 && <DialogSection title="Eligible master contracts">
        <FxTable label="Eligible master contracts" columns={cols} rows={eligible} rowKey={m => m.mc} select="single" picked={picked} onPick={setPicked} pageSizes={[10]} empty="No eligible master contracts." />
        {mc && (tol.length ? tol.map(t => <div key={t} className="tsf-check bad" role="alert">{t}</div>) : <div className="tsf-check">Tolerance check passed. Remaining balance after this deal: USD {amt(after)}</div>)}
      </DialogSection>}
      {step === 2 && <DialogSection title="Generate Deal ID">
        <Facts items={[['New Deal ID', nextDealId], ['Master Contract', mc?.mc ?? '–'], ['Leg 1', `${rows[0].ref} - D1 (Paired Model)`], ['Leg 2', `${rows[1].ref} - D2 (Auto Deal)`], ['Remaining balance (USD)', amt(after)]]} />
        <div className="tsf-check warn">Both legs will be released to the Mid Office under this Deal ID.</div>
      </DialogSection>}
    </Modal>
  );
}

export function SsDialog({ rows, onConfirm, onClose }: { rows: BlotterRow[]; onConfirm: (noInvoice: boolean) => void; onClose: () => void }) {
  const [noInvoice, setNoInvoice] = useState(false);
  const same = rows[0].cur1 === rows[1].cur1 && rows[0].cur2 === rows[1].cur2;
  return (
    <Modal size="wide" title="Release to MO - Short Straddle" subtitle="Assign a Short Straddle Deal ID to the two legs." onClose={onClose}
      footer={<><button className="button secondary" onClick={onClose}>Cancel</button><button className="button" disabled={!same} onClick={() => onConfirm(noInvoice)}>Assign SS Deal ID &amp; Release</button></>}>
      <DialogSection title="Legs"><FxTable label="Straddle legs" columns={legCols} rows={legsFor(rows)} rowKey={r => r.id} pageSizes={[10]} empty="No legs." /></DialogSection>
      <DialogSection title="Options">
        <label className="tsf-check-row"><input type="checkbox" checked={noInvoice} onChange={e => setNoInvoice(e.target.checked)} /> No-Invoice model (SS Deal ID only, skip trade invoicing linkage)</label>
      </DialogSection>
      {same ? <div className="tsf-check">Eligible: both Created legs share the currency pair {rows[0].cur1}/{rows[0].cur2}.</div>
        : <div className="tsf-check bad" role="alert">Currency pairs do not match between the two legs.</div>}
    </Modal>
  );
}

interface Block { tradeDate: string; valueDate: string; bank: string; amount: string; rate: string; swap: string; mode: string; fixDate: string; fixRef: string }
export interface AutoResult { origin: string; mc: Mc; deals: [Block, Block] }

export function AutoDealDialog({ mcs, today, onCreate, onClose }: { mcs: Mc[]; today: string; onCreate: (r: AutoResult) => void; onClose: () => void }) {
  const { banks, companies, bankText, companyText } = useMasters();
  const [origin, setOrigin] = useState(companies[0]?.code ?? '');
  const [mcId, setMcId] = useState('');
  const [picker, setPicker] = useState(false);
  const [error, setError] = useState('');
  const mc = mcs.find(m => m.mc === mcId);
  const mk = (extra: number, m?: Mc): Block => {
    const v = workingDay(addDays(today, 32 + extra));
    return { tradeDate: today, valueDate: v, bank: banks[0]?.code ?? '', amount: m ? String(Math.round(Math.min(mcBalance(m), m.amountUsd * 0.4))) : '', rate: m ? (BASE_RATES[m.pair] ?? 0).toFixed(4) : '', swap: '0.00', mode: '360T', fixDate: addDays(v, -2), fixRef: 'FBIL' };
  };
  const [deals, setDeals] = useState<[Block, Block]>([mk(0), mk(1)]);
  const choose = (id: string) => { const m = mcs.find(x => x.mc === id); setMcId(id); setPicker(false); setError(''); if (m) setDeals([mk(0, m), mk(1, m)]); };
  const set = (i: 0 | 1, p: Partial<Block>) => { setDeals(d => (i === 0 ? [{ ...d[0], ...p }, d[1]] : [d[0], { ...d[1], ...p }])); setError(''); };
  const [c1, c2] = (mc?.pair ?? 'USD/INR').split('/');
  const ndf = mc?.model === 'M037';
  const submit = () => {
    if (!mc) { setError('Select a Master Contract (MC Ref No).'); return; }
    const [a, b] = deals;
    if (!(num(a.amount) > 0) || !(num(b.amount) > 0)) return setError('Enter an amount greater than zero for both deals.');
    if (num(a.amount) !== num(b.amount)) return setError('Deal 1 and Deal 2 Amount 1 must be identical.');
    if (num(a.amount) > mcBalance(mc) * 1.05) return setError('Deal amount exceeds the Master Contract available amount plus tolerance.');
    if (!(rateNum(a.rate) > 0)) return setError('Deal 1: All in Rate must be greater than zero.');
    if (!(rateNum(b.rate) > 0)) return setError('Deal 2: All in Rate must be greater than zero.');
    onCreate({ origin, mc, deals });
  };
  const mcCols: FxColumn<Mc>[] = [
    { id: 'mc', label: 'MC Ref No', kind: 'code', value: m => m.mc }, { id: 'model', label: 'FX Model', value: m => modelLabel(m.model) }, { id: 'com', label: 'Commodity', value: m => m.commodity },
    { id: 'pair', label: 'Currency Pair', value: m => m.pair }, { id: 'av', label: 'Available (USD)', kind: 'amount', value: m => mcBalance(m), render: m => amt(mcBalance(m)) }
  ];
  const block = (i: 0 | 1) => {
    const d = deals[i];
    const spot = rateNum(d.rate) - rateNum(d.swap) / 100;
    return (
      <DialogSection key={i} title={`Deal ${i + 1}`} description={`${i === 0 ? 'Buy' : 'Sell'} ${c1} / ${i === 0 ? 'Sell' : 'Buy'} ${c2} - ${i === 0 ? 'D1 (Paired Model)' : 'D2 (Auto Deal)'}`}>
        <div className="tsf-fields">
          <label className="tsf-field">Trade Date*<input type="date" value={d.tradeDate} onChange={e => set(i, { tradeDate: e.target.value })} /></label>
          <label className="tsf-field">Value Date*<input type="date" value={d.valueDate} onChange={e => set(i, { valueDate: e.target.value })} /></label>
          <label className="tsf-field">Partner*<select value={d.bank} onChange={e => set(i, { bank: e.target.value })}>{banks.map(b => <option key={b.code} value={b.code}>{b.text}</option>)}</select></label>
          <div className="tsf-field"><span>Amount 1*</span><AmountInput bare value={d.amount} label={`Deal ${i + 1} Amount 1`} onValue={v => set(i, { amount: v })} /></div>
          <label className="tsf-field">All in Rate*<input inputMode="decimal" value={d.rate} onChange={e => set(i, { rate: e.target.value })} /></label>
          <label className="tsf-field">Swap<input inputMode="decimal" value={d.swap} onChange={e => set(i, { swap: e.target.value })} /></label>
          <label className="tsf-field">Spot<input readOnly value={rate(spot)} /></label>
          <label className="tsf-field">Mode of Trade<select value={d.mode} onChange={e => set(i, { mode: e.target.value })}>{MODES.map(m => <option key={m}>{m}</option>)}</select></label>
          {ndf && <label className="tsf-field">NDF Fixing Date<input type="date" value={d.fixDate} onChange={e => set(i, { fixDate: e.target.value })} /></label>}
          {ndf && <label className="tsf-field">NDF Fixing Ref<select value={d.fixRef} onChange={e => set(i, { fixRef: e.target.value })}>{FIX_REFS.map(f => <option key={f}>{f}</option>)}</select></label>}
          <label className="tsf-field">Company Code<input readOnly value={`${origin} - ${companyText(origin)}`} /></label>
          <label className="tsf-field">Transaction Type<input readOnly value={typeLabel(ndf ? 'NDF' : 'FWD')} /></label>
          <label className="tsf-field">Currencies<input readOnly value={`${c1} / ${c2}`} /></label>
          <label className="tsf-field">Amount 2 ({c2})<input readOnly value={amt(num(d.amount) * rateNum(d.rate))} /></label>
        </div>
      </DialogSection>
    );
  };
  return (
    <Modal size="wide" title="Auto-create Deals" subtitle="Create a D1/D2 pair of deals from a Master Contract." onClose={onClose} onPrimary={submit}
      footer={<><button className="button secondary" onClick={onClose}>Cancel</button><button className="button" onClick={submit}>Create Deals</button></>}>
      {error && <div className="tsf-check bad" role="alert">{error}</div>}
      <DialogSection title="Master Contract">
        <div className="tsf-fields">
          <label className="tsf-field">Origin Entity<select value={origin} onChange={e => setOrigin(e.target.value)}>{companies.map(c => <option key={c.code} value={c.code}>{c.code} - {c.text}</option>)}</select></label>
          <div className="tsf-field"><span>MC Ref No*</span><div className="bl-pick"><input readOnly aria-label="MC Ref No" value={mcId} placeholder="Select a master contract" /><button type="button" className="button secondary small" onClick={() => setPicker(true)}>Select</button></div></div>
        </div>
        {mc && <Facts items={[['MC Amount (USD)', amt(mc.amountUsd)], ['Available (USD)', amt(mcBalance(mc))], ['MC Date', date(mc.mcDate)], ['Shipping End', date(mc.shipEnd)], ['Bank', bankText(deals[0].bank)]]} />}
      </DialogSection>
      {block(0)}
      {block(1)}
      {picker && <Modal size="wide" title="View Master Contracts" onClose={() => setPicker(false)} footer={<button className="button secondary" onClick={() => setPicker(false)}>Close</button>}>
        <FxTable label="Master contracts" columns={mcCols} rows={mcs.filter(m => mcBalance(m) > 0)} rowKey={m => m.mc} select="single" picked={mcId ? [mcId] : []} onPick={k => k[0] && choose(k[0])} onOpen={m => choose(m.mc)} pageSizes={[10]} empty="No open master contracts." />
        <p className="tsf-sample">Click a row, or double-click it, to choose the master contract.</p>
      </Modal>}
    </Modal>
  );
}
