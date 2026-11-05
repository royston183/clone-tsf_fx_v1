import { DataTable } from '@/components/table/DataTable';
// A security class and its transactions in the company code, ported from the SAP Reporting app (ClassDialog.jsx); a
// transaction opens its FTR_DISPLAY pop-up, which leads back to the class.
import { useState } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { TRANSACTION_SOURCES } from '@/config/transactions';
import { usePost } from '@/lib/client/use-post';
import { codeName, date, money, rate, stripZeros } from '@/lib/trm/rules';
import { readClass } from '@/lib/trm/sources';
import type { ClassTarget, SecurityClassView } from '@/lib/trm/types';
import { TransactionModal as Modal } from './TransactionModal';
import TransactionDialog from './TransactionDialog';

const s = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

/** Reads the class from its source (the id only keys the request). */
const fetchClass = (_id: string, target: ClassTarget) => readClass(target, TRANSACTION_SOURCES);

export default function ClassDialog({ target, onClose }: { target: ClassTarget; onClose: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [page, setPage] = useState(0), [pageSize, setPageSize] = useState(20);
  const res = usePost(fetchClass, 'trm', target);
  const data: SecurityClassView | null = res.data ?? res.last, loading = res.loading, error = res.error?.message ?? '';
  if (open) return <TransactionDialog target={{ kind: 'deal', bukrs: target.bukrs, deal: open }} onClose={onClose} onBack={() => setOpen(null)} />;
  const c = data?.securityClass;
  const id = c ? stripZeros(c.SecurityClass) : target.securityClass;
  const count = data?.transactions.length ?? 0, pages = Math.max(1, Math.ceil(count / pageSize));
  return (
    <Modal title={`Security class ${id}`} subtitle={c ? [s(c.SecurityClassName), target.bukrs].filter(Boolean).join(' · ') : target.bukrs} wide onClose={onClose}
      footer={<button className="button small" onClick={onClose}>Close</button>}>
      {loading && <p className="td-muted td-loading" role="status"><RefreshCw size={16} className="spin" />Loading from SAP…</p>}
      {error && <div className="td-error" role="alert"><AlertCircle size={16} /><span>{error}</span><button className="button secondary small" onClick={res.retry}><RefreshCw size={14} />Retry</button></div>}
      {c && data && !loading && <>
        <div className="td-grid">
          <div className="td-field"><span>Description</span><b>{s(c.SecurityClassDescription) || '—'}</b></div>
          <div className="td-field"><span>ISIN</span><b className={c.Isin ? '' : 'td-empty'}>{s(c.Isin) || '—'}</b></div>
          <div className="td-field"><span>Product type</span><b>{codeName(c.FinancialInstrumentProductType, c.ProductTypeName) || '—'}</b></div>
        </div>
        <h3 className="td-h">Transactions in {target.bukrs}</h3>
        <div className="td-scroll"><DataTable className="ds-table md-table td-table"><thead><tr><th>Transaction</th><th>Transaction type</th><th>Status</th><th>Position value date</th><th className="num">Units</th><th className="num">Payment amount</th><th>Securities account</th></tr></thead>
          <tbody>{data.transactions.slice(page * pageSize, (page + 1) * pageSize).map(t => {
            const deal = stripZeros(t.FinancialTransaction);
            return <tr key={s(t.FinancialTransaction)}><td><button type="button" className="td-link" onClick={() => setOpen(deal)}>{deal}</button></td><td>{s((t.TransactionTypeName || t.FinancialInstrTransactionType))}</td>
              <td>{s((t.FinancialInstrumentStatusName || t.FinancialInstrumentStatus))}</td><td>{date(t.FinTransPositionValueDate)}</td><td className="num">{rate(t.FinTransTradedNumberOfUnits, 3)}</td>
              <td className="num">{money(t.PaymentAmount, t.PaymentCurrency)}</td><td>{s(t.SecurityAccount)}</td></tr>;
          })}</tbody></DataTable></div>
        <div className="report-pagination td-pagination"><span>{count} transactions</span><div><span>Rows per page</span>
          <select aria-label="Transactions per page" value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(0); }}>{[10, 20, 25, 50, 100].map(size => <option key={size}>{size}</option>)}</select>
          <button className="icon-button" aria-label="Previous transactions" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft size={15} /></button><span>Page {page + 1} of {pages}</span>
          <button className="icon-button" aria-label="Next transactions" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}><ChevronRight size={15} /></button></div></div>
      </>}
    </Modal>
  );
}
