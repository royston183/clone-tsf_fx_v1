import { DataTable } from '@/components/table/DataTable';
// FTR_DISPLAY of a TRM transaction, in the screen SAP uses for its product category (lib/trm/ftr.ts layoutOf), ported
// from the SAP Reporting app (src/pages/trm-deal/DealDialog.jsx): the same header block, tab strip, group boxes and grids
// (styles/trmdeal.css). The transaction comes from its source (src/config/transactions.ts).
import { useState, type ReactNode } from 'react';
import { AlertCircle, ArrowLeft, Pencil, RefreshCw } from 'lucide-react';
import { TRANSACTION_SOURCES } from '@/config/transactions';
import {
  activeFlowsOf, adminOf, flowTotals, headerOf, layoutOf, moneyMarketAdminOf, moneyMarketHeaderOf, moneyMarketOf, moneyMarketStatusOf, otherFlowsOf,
  percent, postingText, signed, statusOf, structureOf, type FtrTabId
} from '@/lib/trm/ftr';
import { usePost } from '@/lib/client/use-post';
import { date } from '@/lib/trm/rules';
import { readDeal } from '@/lib/trm/sources';
import type { DealTarget, TrmDeal, TrmFlow, TrmValue } from '@/lib/trm/types';
import { TransactionModal as Modal } from './TransactionModal';

const s = (v: TrmValue): string => (v === null || v === undefined ? '' : String(v));
function Row({ label, children }: { label: string; children: ReactNode }) { return <div className="ftr-row"><span>{label}</span><span className="ftr-vals">{children}</span></div>; }
const V = ({ children, wide, num }: { children?: ReactNode; wide?: boolean; num?: boolean }) => <span className={`ftr-val${wide ? ' wide' : ''}${num ? ' num' : ''}`}>{children ?? ''}</span>;
const Code = ({ value: [code, name] }: { value: [string, string] }) => <><V>{code}</V>{name && <span className="ftr-text">{name}</span>}</>;
const Box = ({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) => <fieldset className={`ftr-box ${className}`}><legend>{title}</legend>{children}</fieldset>;

/** Reads the transaction from its source (the id only keys the request). */
const fetchDeal = (_id: string, target: DealTarget) => readDeal(target, TRANSACTION_SOURCES);

/** The pop-up of one transaction: loading, SAP's message with Retry, or the FTR_DISPLAY screen. */
export default function TransactionDialog({ target, onClose, onBack }: { target: DealTarget; onClose: () => void; onBack?: () => void }) {
  const [tab, setTab] = useState<FtrTabId>('structure');
  const res = usePost(fetchDeal, 'trm', target);
  const deal: TrmDeal | null = res.data, loading = res.loading, error = res.error?.message ?? '';
  const layout = deal ? layoutOf(deal) : null, money = layout?.kind === 'moneyMarket';
  const current = layout ? layout.tabs.find(item => item.id === tab) ?? layout.tabs[0] : null;
  const title = deal && layout && current ? `Display ${layout.name}: ${current.title}` : `Transaction ${target.deal}`;
  return (
    <Modal title={title} subtitle={deal ? undefined : target.bukrs} wide onClose={onClose}
      footer={<>{onBack && <button className="button secondary small" onClick={onBack}><ArrowLeft size={14} />Back to class</button>}{deal && <button className="button secondary small" disabled title="Transaction changes are not supported by the connected service."><Pencil size={14} />Edit</button>}<button className="button small" onClick={onClose}>Close</button></>}>
      {loading && <p className="td-muted td-loading" role="status"><RefreshCw size={16} className="spin" />Loading from SAP…</p>}
      {error && <div className="td-error" role="alert"><AlertCircle size={16} /><span>{error}</span><button className="button secondary small" onClick={res.retry}><RefreshCw size={14} />Retry</button></div>}
      {deal && layout && current && !loading && <div className="ftr trm-deal">
        {money ? <MoneyMarketHeader deal={deal} /> : <Header deal={deal} />}
        <div className="ftr-tabs" role="tablist" aria-label="Transaction details">{layout.tabs.map(item => <button key={item.id} type="button" role="tab" aria-selected={current.id === item.id} className={current.id === item.id ? 'on' : ''} onClick={() => setTab(item.id)}>{item.label}</button>)}</div>
        <div className="ftr-panel" role="tabpanel" aria-label={current.label}>
          {current.id === 'structure' && (money ? <MoneyMarketStructure deal={deal} /> : <Structure deal={deal} classic={layout.classic} />)}
          {current.id === 'trading' && <TradingData deal={deal} />}
          {current.id === 'admin' && (money ? <MoneyMarketAdministration deal={deal} /> : <Administration deal={deal} />)}
          {current.id === 'otherflows' && <OtherFlows deal={deal} />}
          {current.id === 'payment' && <PaymentDetails deal={deal} />}
          {current.id === 'cashflow' && <CashFlow rows={activeFlowsOf(deal)} />}
          {current.id === 'status' && (money ? <MoneyMarketStatus deal={deal} /> : <Status deal={deal} />)}
        </div>
      </div>}
    </Modal>
  );
}

/** Header block: Company Code, Transaction, Security Class, Activity, Transaction Type. */
function Header({ deal }: { deal: TrmDeal }) {
  const h = headerOf(deal);
  return <div className="ftr-head">
    <div><Row label="Company Code"><Code value={h.companyCode} /></Row><Row label="Security Class"><Code value={h.securityClass} /></Row><Row label="Transaction Type"><Code value={h.transactionType} /></Row></div>
    <div><Row label="Transaction"><V wide>{h.transaction}</V></Row><Row label="Activity"><Code value={h.activity} /></Row></div>
  </div>;
}

const Partner = ({ partner }: { partner: { number: string; text: string } }) => <><V>{partner.number}</V><span className="ftr-text">{partner.text}</span></>;
interface Conclusion { date: TrmValue; time: string; zone: string; contactPerson: string; trader: string; externalReference: string; mic?: string }
const ContractDate = ({ c }: { c: Conclusion }) => <><V>{date(c.date)}</V><span className="ftr-text">/</span><V>{c.time}</V><span className="ftr-text">/</span><V>{c.zone}</V></>;
/** SAP's Contract Conclusion box at the foot of the Structure tab (the money market one adds MIC). */
const ConclusionBox = ({ c, mic }: { c: Conclusion; mic?: boolean }) => <Box title="Contract Conclusion" className="ftr-two">
  <div><Row label="Contract Date"><ContractDate c={c} /></Row><Row label="Contact Person"><V wide>{c.contactPerson}</V></Row>{mic && <Row label="MIC"><V>{c.mic}</V></Row>}</div>
  <div><Row label="Trader"><V wide>{c.trader}</V></Row><Row label="Ext. Ref."><V wide>{c.externalReference}</V></Row></div>
</Box>;

/** Stock / Investment Fund / Bond Structure tab in SAP's order: Partner, Flow Type, Position | Date Details, Amounts, Trading Data,
 *  Contract Conclusion. The convertible bond's older screen (classic) keeps trading and contract data on its Trading Data tab. */
function Structure({ deal, classic }: { deal: TrmDeal; classic?: boolean }) {
  const { conclusion: c, partner, securities: x } = structureOf(deal);
  return <>
    <div><Row label="Partner"><Partner partner={partner} /></Row><Row label="Flow Type"><Code value={x.flowType} /></Row></div>
    <div className="ftr-cols">
      <Box title="Position"><Row label="Securities Account"><Code value={x.account} /></Row><Row label="General Valuation Class"><V wide>{x.valuationClass}</V></Row></Box>
      <Box title="Date Details"><Row label="Position Value Date"><V>{date(x.positionDate)}</V></Row><Row label="Calculation Date"><V>{date(x.calculationDate)}</V></Row><Row label="Payment Date"><V>{date(x.paymentDate)}</V></Row></Box>
    </div>
    <Box title="Amounts" className="ftr-two">
      <div>
        <Row label="Number of Units"><V num>{x.units}</V></Row>
        <Row label="Price (Unit-Quoted)"><V num>{x.price}</V><V>{x.priceCurrency}</V></Row>
        <Row label="Market Value"><V num>{x.marketValue}</V><V>{x.marketValueCurrency}</V></Row>
        <Row label="Payment Amount"><V num>{x.paymentAmount}</V><V>{x.paymentCurrency}</V></Row>
      </div>
      {x.marketPrice && <div><Row label="Mkt Price"><V num>{x.marketPrice}</V><V>{x.marketPriceCurrency}</V></Row><Row label="Origin"><V wide>{x.origin}</V></Row></div>}
    </Box>
    {!classic && <><Box title="Trading Data"><Row label="Exchange"><V wide>{x.exchange}</V></Row></Box><ConclusionBox c={c} /></>}
  </>;
}

/** Trading Data tab of the convertible bond screen: Contract Data and Trading (Order and Reservation are not in the service). */
function TradingData({ deal }: { deal: TrmDeal }) {
  const { conclusion: c, securities: x } = structureOf(deal);
  return <div className="ftr-cols">
    <Box title="Contract Data"><Row label="Contact Person"><V wide>{c.contactPerson}</V></Row><Row label="Contract Date"><V>{date(c.date)}</V><V>{c.time}</V></Row><Row label="External Reference"><V wide>{c.externalReference}</V></Row></Box>
    <Box title="Trading"><Row label="Trader"><V wide>{c.trader}</V></Row><Row label="Exchange"><V wide>{x.exchange}</V></Row></Box>
  </div>;
}

/** Header of the Interest Rate Instrument screen: Company Code, Product Type, Transaction Type | Transaction, Activity. */
function MoneyMarketHeader({ deal }: { deal: TrmDeal }) {
  const h = moneyMarketHeaderOf(deal);
  return <div className="ftr-head">
    <div><Row label="Company Code"><Code value={h.companyCode} /></Row><Row label="Product Type"><Code value={h.productType} /></Row><Row label="Transaction Type"><Code value={h.transactionType} /></Row></div>
    <div><Row label="Transaction"><V wide>{h.transaction}</V></Row><Row label="Activity"><Code value={h.activity} /></Row></div>
  </div>;
}

/** Structure tab of the Interest Rate Instrument, as SAP lays it out. */
function MoneyMarketStructure({ deal }: { deal: TrmDeal }) {
  const { partner, invest: i, term: t, interest: n, repayment: r, conclusion: c } = moneyMarketOf(deal);
  const f = n?.frequency;
  return <>
    <Row label="Partner"><Partner partner={partner} /></Row>
    <div className="ftr-cols">
      <Box title="Invest">
        <Row label="Flow Type"><Code value={i.flowType} /></Row>
        <Row label="Amount"><V num>{i.amount}</V><V>{i.direction}</V><V>{i.currency}</V></Row>
        <Row label="Rounding Cat."><V wide>{i.rounding}</V></Row>
      </Box>
      <Box title="Term">
        <Row label="Start"><V>{date(t.start)}</V></Row><Row label="End"><V>{date(t.end)}</V></Row>
        <Row label="Inclusive"><V wide>{t.inclusive}</V></Row><Row label="Term Cat."><V wide>{t.category}</V></Row>
      </Box>
    </div>
    {n && f && <Box title="Interest Structure" className="ftr-two">
      <div>
        <Row label="Interest Cat."><V wide>{n.category}</V></Row>
        <Row label="Percentage Rate"><V>{n.rate}</V></Row>
        <Row label="Int.Calc.Method"><V wide>{n.method}</V></Row>
        <Row label="Frequency"><V wide>{f.label}</V></Row>
        {f.manual && <><Row label="Item Eff. From"><V>{date(f.validFrom)}</V></Row><Row label="Due Date"><V>{date(f.dueDate)}</V></Row><Row label="Calculat. Date"><V>{date(f.calculationDate)}</V></Row></>}
        {f.every && <Row label="Every"><V>{f.every[0]}</V><V>{f.every[1]}</V></Row>}
      </div>
      <div><Row label="Condition Type"><Code value={n.conditionType} /></Row><Row label="Condition Group"><V>{n.conditionGroup}</V></Row></div>
    </Box>}
    {r && <Box title="Repayment Structure" className="ftr-two">
      <div><Row label="Repaymnt Method"><V wide>{r.method}</V></Row></div>
      <div><Row label="Condition Type"><Code value={r.conditionType} /></Row></div>
    </Box>}
    <ConclusionBox c={c} mic />
  </>;
}

/** Administr. tab of the Interest Rate Instrument (Rating and SPPI classification are not in the service). */
function MoneyMarketAdministration({ deal }: { deal: TrmDeal }) {
  const a = moneyMarketAdminOf(deal);
  return <>
    <Box title="Position Assignment">
      <Row label="Facility"><V wide>{a.facility}</V></Row><Row label="Portfolio"><Code value={a.portfolio} /></Row><Row label="Guarantor"><V wide>{a.guarantor}</V></Row>
      <Row label="Finance Project"><V wide>{a.financeProject}</V></Row><Row label="Gen. Valn Class"><V wide>{a.valuationClass}</V></Row>
    </Box>
    <Box title="Additional Fields">
      <Row label="Assignment"><V wide>{a.assignment}</V></Row><Row label="Internal Reference"><V wide>{a.reference}</V></Row><Row label="Characteristics"><V wide>{a.characteristic}</V></Row>
      <Row label="CFI Code"><V>{a.cfiCode}</V></Row><Row label="Unique Prod. ID"><V wide>{a.productId}</V></Row><Row label="Rept Trackg No."><V wide>{a.reportTrackingNumber}</V></Row>
      <Row label="Business place"><V>{a.businessPlace}</V></Row>
    </Box>
    <Box title="Authorization"><Row label="Authorization Group"><V>{a.authorizationGroup}</V></Row></Box>
  </>;
}

const who = ([user, ...rest]: string[]) => <><V wide>{user}</V><span className="ftr-text">{rest.filter(Boolean).join(' ')}</span></>;

/** Status tab of the Interest Rate Instrument: the activity box shows Last Changed By instead of the previous activity. */
function MoneyMarketStatus({ deal }: { deal: TrmDeal }) {
  const x = moneyMarketStatusOf(deal);
  return <>
    <Box title="Correspondence"><Row label="Confirmation"><Code value={x.confirmation} /></Row><Row label="Counterconfirm"><Code value={x.counterconfirmation} /></Row></Box>
    <Box title="Activity">
      <Row label="Activity Cat."><Code value={x.activityCategory} /></Row><Row label="Status"><Code value={x.activityStatus} /></Row>
      <Row label="Entered By">{who(x.entered)}</Row><Row label="Last Changed By">{who(x.activityChanged)}</Row>
    </Box>
    <Box title="Transaction" className="ftr-two">
      <div>
        <Row label="Processing Cat."><Code value={x.processingCategory} /></Row><Row label="Status"><Code value={x.status} /></Row><Row label="Release Status"><Code value={x.releaseStatus} /></Row>
        <Row label="Created By">{who(x.created)}</Row><Row label="Last Changed By">{who(x.changed)}</Row>
      </div>
      <div><Row label="Active Activity"><V>{x.activeActivity}</V></Row></div>
    </Box>
  </>;
}

function Administration({ deal }: { deal: TrmDeal }) {
  const a = adminOf(deal);
  return <>
    <Box title="Position Assignment"><Row label="Portfolio"><Code value={a.portfolio} /></Row><Row label="Gen. Valn Class"><V wide>{a.valuationClass}</V></Row></Box>
    <Box title="Assignment" className="ftr-two">
      <div><Row label="Assignment"><V wide>{a.assignment}</V></Row><Row label="Internal Ref."><V wide>{a.reference}</V></Row><Row label="Characteristics"><V wide>{a.characteristic}</V></Row></div>
      <div><Row label="Business place"><V wide>{a.businessPlace}</V></Row><Row label="Authorization Group"><V wide>{a.authorizationGroup}</V></Row></div>
    </Box>
  </>;
}

/** SAP "Other Flows": the additional flows (category 90) of the active activity. */
function OtherFlows({ deal }: { deal: TrmDeal }) {
  const rows = otherFlowsOf(deal);
  return <Box title="Other Flows">
    <div className="td-scroll"><DataTable className="ds-table ftr-grid ftr-small"><thead><tr><th>Flow Type</th><th>Name</th><th>D.</th><th className="num">Payment Amount</th><th>Pay. Crcy</th><th>Payment Date</th><th>Posting Status</th></tr></thead>
      <tbody>{rows.length ? rows.map(f => <tr key={`${s(f.FinancialInstrumentActivity)}|${s(f.FinTransFlowNumber)}`}><td>{s(f.FinTransFlowType)}</td><td>{s(f.FinTransFlowTypeName)}</td><td>{s(f.FinTransFlowPaytAmtDirection)}</td><td className="num">{signed(f.FinTransFlowPaytAmt)}</td><td>{s(f.FinTransFlowPaytAmtCrcy)}</td><td>{date(f.FinTransFlowPaymentDate)}</td><td>{postingText(f)}</td></tr>)
        : <tr><td colSpan={7} className="td-muted">No other flows.</td></tr>}</tbody></DataTable></div>
    <p className="td-muted">Entries {rows.length}</p>
  </Box>;
}

/** SAP "Payment Details": the payer/payee; the payment detail entries are not part of the service. */
function PaymentDetails({ deal }: { deal: TrmDeal }) {
  const { partner } = structureOf(deal);
  return <>
    <Box title="Payer/Payee of Transaction"><Row label="Payer/Payee"><Partner partner={partner} /></Row></Box>
    <p className="td-muted">Payment detail entries (house bank, account, payment request) are not delivered by the connected service.</p>
  </>;
}

/** SAP "Flows" grid of the Cash Flow tab: the active activity's flows, SAP's columns and total line. */
function CashFlow({ rows }: { rows: TrmFlow[] }) {
  return <div className="td-scroll"><DataTable className="ds-table ftr-grid"><caption>Flows</caption>
    <thead><tr><th>Pmnt Date</th><th>FTyp</th><th>D</th><th>Flow Type (Name)</th><th className="num">PmntAmtPyC</th><th>PmntCurr.</th><th>Cal.from</th><th>Calc. To</th><th>Int.Fx.Dte</th><th>DocumentNo</th><th>PS</th><th>Post.Stat.</th><th className="num">Percent</th></tr></thead>
    <tbody>{rows.length ? rows.map(f => <tr key={`${s(f.FinancialInstrumentActivity)}|${s(f.FinTransFlowCreationDate)}|${s(f.FinTransFlowCreationTime)}|${s(f.FinTransFlowNumber)}`}>
      <td>{date(f.FinTransFlowPaymentDate)}</td><td>{s(f.FinTransFlowType)}</td><td>{s(f.FinTransFlowPaytAmtDirection)}</td><td>{s(f.FinTransFlowTypeName)}</td>
      <td className="num">{signed(f.FinTransFlowPaytAmt, f.FinTransFlowPaytAmtDirection)}</td><td>{s(f.FinTransFlowPaytAmtCrcy)}</td>
      <td>{date(f.CalculationPeriodStartDate)}</td><td>{date(f.CalculationPeriodEndDate)}</td><td>{date(f.FinTransFlowIntrstRateFixDate)}</td><td>{s(f.AccountingDocument)}</td>
      <td>{s(f.FinTransFlowPostingStatus)}</td><td>{postingText(f)}</td><td className="num">{percent(f.ConditionPercentageRate)}</td></tr>)
      : <tr><td colSpan={13} className="td-muted">No flows.</td></tr>}</tbody>
    <tfoot>{flowTotals(rows).map(t => <tr key={t.currency} className="ftr-total"><td colSpan={4}>Total</td><td className="num">{t.text}</td><td>{t.currency}</td><td colSpan={7} /></tr>)}</tfoot></DataTable></div>;
}

function Status({ deal }: { deal: TrmDeal }) {
  const x = statusOf(deal);
  return <>
    <Box title="Correspondence" className="ftr-two"><div><Row label="Confirmation"><Code value={x.confirmation} /></Row></div><div><Row label="Counterconfirm."><Code value={x.counterconfirmation} /></Row></div></Box>
    <Box title="Activity">
      <Row label="Activity Cat."><Code value={x.activityCategory} /></Row><Row label="Status"><Code value={x.activityStatus} /></Row>
      <Row label="Prev. Activity"><V>{x.previousActivity}</V></Row><Row label="Entered By">{who(x.entered)}</Row>
    </Box>
    <Box title="Transaction">
      <Row label="Processing Cat."><Code value={x.processingCategory} /></Row><Row label="Status"><Code value={x.status} /></Row><Row label="Active Activity"><V>{x.activeActivity}</V></Row>
      <Row label="Release Status"><Code value={x.releaseStatus} /></Row><Row label="Created By">{who(x.created)}</Row><Row label="Last Changed By">{who(x.changed)}</Row>
    </Box>
  </>;
}
