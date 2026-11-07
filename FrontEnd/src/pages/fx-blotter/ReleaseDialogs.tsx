// Release to MO popups of the FX Blotter that still work on this page only (assign one leg, Short Straddle).
// Auto-create Deals and Release to MO of a pair run against SAP: SapDialogs.tsx.
import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { DialogSection } from '@/components/ui/DialogSection';
import { FxTable, type FxColumn } from '@/pages/fx/FxTable';
import { amt, date, rate } from '@/pages/fx/format';
import { modelLabel, type BlotterRow, type Mc, type OpenDeal } from './data';
import { Facts } from './InfoDialogs';
import { useMasters } from './masters';
import { amount2, assignIssues, num, rateNum } from './logic';

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
