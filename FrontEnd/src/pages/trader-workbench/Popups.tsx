// The action popups of the Trader Workbench: Update Rate, Create Spot, NDF Details and Settlement (difference) Spot.
import { useState, type ReactNode } from 'react';
import { Modal } from '@/components/ui/Modal';
import { DialogSection } from '@/components/ui/DialogSection';
import { amt, addDays, date } from '@/pages/fx/format';
import { BANKS, COMPANIES } from '@/pages/fx/sample';
import type { Deal, Txn } from './data';

export const num = (s: string): number | null => {
  const n = Number(s.replace(/,/g, '').trim());
  return s.trim() === '' || !Number.isFinite(n) ? null : n;
};
const spotNo = () => `17${String(Date.now()).slice(-8)}`;

function Field({ label, error, children, required }: { label: string; error?: string; children: ReactNode; required?: boolean }) {
  return <label className="tsf-field">{label}{required && <span aria-hidden="true"> *</span>}{children}{error && <span className="tsf-err" role="alert">{error}</span>}</label>;
}
const RO = ({ label, value }: { label: string; value: ReactNode }) => (
  <Field label={label}><input readOnly value={typeof value === 'string' || typeof value === 'number' ? String(value) : ''} /></Field>
);

/** Option exercise or expiry from the current market rate. */
export function UpdateRateModal({ txn, onClose, onUpdated }: { txn: Txn; onClose: () => void; onUpdated: (outcome: 'exercise' | 'expire', rate: number) => void }) {
  const [rateText, setRate] = useState('');
  const [tried, setTried] = useState(false);
  const market = num(rateText);
  const outcome = market === null || txn.strike === null ? null
    : (txn.callPut === 'Call' && market > txn.strike) || (txn.callPut === 'Put' && market < txn.strike) ? 'exercise' : 'expire';
  const error = tried && market === null ? 'Please update the rate' : undefined;
  const submit = () => { setTried(true); if (market !== null && outcome) onUpdated(outcome, market); };
  return (
    <Modal title="Update Rate" subtitle={`${txn.callPut ?? ''} option, strike ${txn.strike?.toFixed(4)}`} eyebrow="Option" size="small" onClose={onClose} onPrimary={submit}
      footer={<><button className="button secondary" onClick={onClose}>Cancel</button><button className="button" onClick={submit}>Update</button></>}>
      <DialogSection title="Rate">
        <div className="tsf-fields">
          <RO label="Cover No" value={txn.id} />
          <Field label="Current Market Rate" required error={error}>
            <input data-autofocus inputMode="decimal" value={rateText} aria-invalid={!!error} placeholder="0.0000" onChange={e => setRate(e.target.value)}
              onBlur={() => market !== null && setRate(market.toFixed(4))} />
          </Field>
        </div>
      </DialogSection>
      {outcome && <p className="tsf-wb-outcome"><span className={`tsf-chip${outcome === 'expire' ? ' tsf-chip--grey' : ''}`}>{outcome === 'exercise' ? 'Option Exercised' : 'Option Expires'}</span></p>}
    </Modal>
  );
}

/** Spot booking from a forward, an option exercise or an NDF fixing. */
export function CreateSpotModal({ txn, today, onClose, onCreated }: { txn: Txn; today: string; onClose: () => void; onCreated: (spot: string) => void }) {
  const [co, setCo] = useState(txn.co);
  const [bp, setBp] = useState(BANKS.find(b => b.text === txn.partner)?.code ?? '');
  const [trade, setTrade] = useState(today);
  const [rateText, setRate] = useState((txn.allIn ?? txn.spot ?? 0) ? String(txn.allIn ?? txn.spot) : '');
  const [tried, setTried] = useState(false);
  const rate = num(rateText);
  const dependent = rate === null ? null : txn.cur2 === 'USD' && txn.cur1 !== 'USD' ? txn.amt1 / rate : txn.amt1 * rate;
  const errs = { co: !co ? 'Co. Code is required.' : '', bp: !bp ? 'BP is required.' : '', rate: rate === null || rate <= 0 ? 'Rate is required.' : '' };
  const submit = () => { setTried(true); if (!errs.co && !errs.bp && !errs.rate) onCreated(spotNo()); };
  const flip = (s: string) => (s === 'Buy' ? 'Sell' : 'Buy');
  return (
    <Modal title="Create Spot" subtitle={`For transaction ${txn.id}`} eyebrow="Spot" onClose={onClose} onPrimary={submit}
      footer={<><button className="button secondary" onClick={onClose}>Cancel</button><button className="button" onClick={submit}>Create Spot</button></>}>
      <DialogSection title="Spot details">
        <div className="tsf-fields">
          <Field label="Co. Code" required error={tried ? errs.co : ''}>
            <select data-autofocus value={co} aria-invalid={tried && !!errs.co} onChange={e => setCo(e.target.value)}><option value="">Select</option>{COMPANIES.map(c => <option key={c.code} value={c.code}>{c.code} · {c.text}</option>)}</select>
          </Field>
          <Field label="BP" required error={tried ? errs.bp : ''}>
            <select value={bp} aria-invalid={tried && !!errs.bp} onChange={e => setBp(e.target.value)}><option value="">Select</option>{BANKS.map(b => <option key={b.code} value={b.code}>{b.code} · {b.text}</option>)}</select>
          </Field>
          <Field label="Trade Date" required><input type="date" value={trade} onChange={e => setTrade(e.target.value)} /></Field>
          <Field label="Rate" required error={tried ? errs.rate : ''}>
            <input inputMode="decimal" value={rateText} aria-invalid={tried && !!errs.rate} onChange={e => setRate(e.target.value)} onBlur={() => rate !== null && setRate(rate.toFixed(4))} />
          </Field>
        </div>
      </DialogSection>
      <DialogSection title="Legs" description="Invoice Value is the reference; the second leg follows the rate.">
        <div className="tsf-fields">
          <RO label="Leg 1 Curr" value={txn.cur1} /><RO label="Leg 1 B/S" value={txn.bs1} /><RO label="Leg 1 Amount (Invoice Value)" value={amt(txn.amt1)} />
          <RO label="Leg 2 Curr" value={txn.cur2} /><RO label="Leg 2 B/S" value={flip(txn.bs1)} /><RO label="Leg 2 Amount" value={amt(dependent)} />
        </div>
      </DialogSection>
    </Modal>
  );
}

/** NDF fixing: the settlement amount from fixing and contract rate. */
export function NdfModal({ txn, onClose, onSent }: { txn: Txn; onClose: () => void; onSent: (rate: number) => void }) {
  const [rateText, setRate] = useState(txn.rbiRate ? String(txn.rbiRate) : '');
  const [tried, setTried] = useState(false);
  const fix = num(rateText);
  const contract = txn.allIn ?? 0;
  const notional = txn.cur1 === 'VND' ? txn.amt2 : txn.amt1;
  const curr = txn.cur1 === 'VND' ? txn.cur2 : txn.cur1;
  const settle = fix && fix > 0 ? ((fix - contract) * notional) / fix : null;
  const error = tried && (fix === null || fix <= 0) ? 'Fixing rate is required' : '';
  const submit = () => { setTried(true); if (fix !== null && fix > 0) onSent(fix); };
  return (
    <Modal title="NDF Details" subtitle={`Transaction ${txn.id}`} eyebrow="NDF" onClose={onClose} onPrimary={submit}
      footer={<><button className="button secondary" onClick={onClose}>Cancel</button><button className="button" onClick={submit}>Send NDF Fixing</button></>}>
      <DialogSection title="Fixing">
        <div className="tsf-fields">
          <RO label="Fixing Date" value={date(txn.ndfFixDate)} />
          <RO label="Fixing Ref" value={txn.fixRef ?? ''} />
          <RO label="Fixing Reference Name" value={txn.fixRef ? `${txn.fixRef} fixing` : ''} />
          <RO label="Contract Rate" value={contract.toFixed(4)} />
          <Field label="Fixing Rate" required error={error}>
            <input data-autofocus inputMode="decimal" value={rateText} aria-invalid={!!error} onChange={e => setRate(e.target.value)} onBlur={() => fix !== null && setRate(fix.toFixed(4))} />
          </Field>
        </div>
      </DialogSection>
      <DialogSection title="Settlement">
        <div className="tsf-fields">
          <RO label="Settlement Amt" value={amt(settle)} />
          <RO label="Settlement Currency" value={curr} />
        </div>
        <p className="tsf-wb-hint">Settlement Amt = (Fixing Rate − Contract Rate) × Notional / Fixing Rate, notional {amt(notional)} {curr}.</p>
      </DialogSection>
    </Modal>
  );
}

/** Invoice difference spot of a transaction. */
export function SettlementSpotModal({ deal, txn, created, today, onClose, onCreated }: { deal: Deal; txn: Txn; created: boolean; today: string; onClose: () => void; onCreated: (spot: string) => void }) {
  const [bp, setBp] = useState(BANKS.find(b => b.text === txn.partner)?.code ?? '');
  const [trade, setTrade] = useState(addDays(txn.value, -2));
  const [valueDate, setValueDate] = useState(txn.value);
  const [rateText, setRate] = useState(txn.allIn ? String(txn.allIn) : '');
  const [tried, setTried] = useState(false);
  const rate = num(rateText);
  const fxAmt = txn.amt1;
  const invoice = txn.invoiceAmt ?? fxAmt;
  const diff = fxAmt - invoice;
  const errs = {
    bp: !bp ? 'BP is required.' : '', trade: !trade ? 'Trade Date is required.' : '', value: !valueDate ? 'Value Date is required.' : valueDate < trade ? 'Value date cannot be before the trade date.' : '',
    rate: rate === null || rate <= 0 ? 'Rate is required.' : '', exists: created ? 'The settlement spot for this deal type has already been created.' : ''
  };
  const bad = Object.values(errs).some(Boolean);
  const submit = () => { setTried(true); if (!bad) onCreated(spotNo()); };
  return (
    <Modal title="Settlement Spot" subtitle={`${deal.id} · transaction ${txn.id}`} eyebrow="Difference spot" onClose={onClose} onPrimary={submit}
      footer={<><button className="button secondary" onClick={onClose}>Cancel</button><button className="button" onClick={submit}>Create Spot</button></>}>
      {tried && errs.exists && <p className="tsf-check bad" role="alert">{errs.exists}</p>}
      <DialogSection title="Difference">
        <div className="tsf-fields">
          <RO label="Date" value={date(today)} /><RO label="Deal ID" value={deal.id} /><RO label="Deal Type" value={txn.dealType} /><RO label="Transaction" value={txn.id} />
          <RO label={`Invoice Amount (${txn.cur1})`} value={amt(invoice)} /><RO label={`FX Deal Amount (${txn.cur1})`} value={amt(fxAmt)} />
          <RO label="Difference" value={amt(diff)} /><RO label="Buy/Sell" value={diff >= 0 ? 'Sell' : 'Buy'} />
          <RO label="Spot" value={created ? 'Created' : 'Pending'} />
        </div>
      </DialogSection>
      <DialogSection title="Spot inputs">
        <div className="tsf-fields">
          <Field label="BP" required error={tried ? errs.bp : ''}>
            <select data-autofocus value={bp} aria-invalid={tried && !!errs.bp} onChange={e => setBp(e.target.value)}><option value="">Select</option>{BANKS.map(b => <option key={b.code} value={b.code}>{b.code} · {b.text}</option>)}</select>
          </Field>
          <Field label="Trade Date" required error={tried ? errs.trade : ''}><input type="date" value={trade} onChange={e => setTrade(e.target.value)} /></Field>
          <Field label="Value Date" required error={tried ? errs.value : ''}><input type="date" value={valueDate} aria-invalid={tried && !!errs.value} onChange={e => setValueDate(e.target.value)} /></Field>
          <Field label="Rate" required error={tried ? errs.rate : ''}>
            <input inputMode="decimal" value={rateText} aria-invalid={tried && !!errs.rate} onChange={e => setRate(e.target.value)} onBlur={() => rate !== null && setRate(rate.toFixed(4))} />
          </Field>
        </div>
      </DialogSection>
    </Modal>
  );
}
