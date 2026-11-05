// One proposal in detail: how it changes the deal, each BL with its trade flow, quantity, USD value and share, and the
// AI's reasoning. Accept writes the Deal ID on its BLs.
import { CheckCircle2, Sparkles } from 'lucide-react';
import { DataTable } from '@/components/table/DataTable';
import { Modal } from '@/components/ui/Modal';
import { formatAmount, formatDate } from '@/lib/fields/parse';
import { str } from '@/lib/grid/grid';
import type { Row } from '@/lib/grid/types';
import { fmtQty } from '@/pages/manage-tradeflows/logic';
import type { DealRow } from './logic';
import type { Proposal } from './ProposeTradeflowsPage';
import { contributions, matchPct } from './view';

const money = (v: number) => formatAmount(v.toFixed(2));

export function ProposalModal({ proposal, rank, deal, bls, busy, onClose, onAccept }: {
  proposal: Proposal; rank: number; deal: DealRow; bls: Map<string, Row>; busy: boolean; onClose: () => void; onAccept: () => void;
}) {
  const { combo, reason } = proposal;
  const rows = combo.bls.map(no => bls.get(no) ?? { blNo: no });
  const parts = contributions(rows.map(b => ({ blNo: str(b.blNo), usdValue: str(b.usdValue) })));
  const before = Number(deal.remainingUsd), total = Number(combo.totalUsd), after = before - total;
  return (
    <Modal title={`Proposal ${rank} for ${deal.dealId}`} eyebrow={rank === 1 ? 'Best match' : `Option ${rank}`}
      subtitle={`${combo.bls.length} BL${combo.bls.length > 1 ? 's' : ''} from ${combo.tfs} trade flow${combo.tfs > 1 ? 's' : ''} · ${deal.tsfCommodity}${deal.tsfCommodityText ? ` ${deal.tsfCommodityText}` : ''}`}
      size="wide" busy={busy} onClose={onClose}
      footer={<>
        <button className="button secondary" disabled={busy} onClick={onClose}>Close</button>
        <button className="button" disabled={busy} onClick={onAccept}><CheckCircle2 size={15} />{busy ? 'Assigning…' : `Assign ${combo.bls.length} BL${combo.bls.length > 1 ? 's' : ''} to ${deal.dealId}`}</button>
      </>}>
      <div className="tsf-proposal">
        <section className="tsf-proposal__section">
          <h4>Effect on the deal</h4>
          <dl className="tsf-proposal__figures">
            <div><dt>Remaining now</dt><dd>{money(before)} <small>USD</small></dd></div>
            <div className="plus"><dt>This proposal</dt><dd>{money(total)} <small>USD</small></dd></div>
            <div className={Math.abs(after) <= Math.abs(before) * 0.01 ? 'good' : ''}><dt>Remaining after</dt><dd>{money(after)} <small>USD</small></dd></div>
            <div><dt>Match</dt><dd>{matchPct(combo.diffPct)} <small>{combo.diffPct > 0 ? '+' : ''}{combo.diffPct.toFixed(2)}%</small></dd></div>
          </dl>
          <div className="tsf-proposal__stack" aria-hidden="true">{parts.map((s, k) => <span key={s.blNo} className={`c${k % 6}`} style={{ width: `${Math.max(s.pct, 2)}%` }} title={`${s.blNo}: ${s.pct}%`} />)}</div>
        </section>
        {reason && !/Ranked by closeness/.test(reason) && (
          <section className="tsf-proposal__section tsf-proposal__why">
            <h4><Sparkles size={14} />Why this proposal</h4>
            <p>{reason}</p>
          </section>
        )}
        <section className="tsf-proposal__section">
          <h4>BLs in this proposal</h4>
          <div className="tsf-proposal__table">
          <DataTable nativeLayout nativeExport aria-label="BLs in the proposal">
            <thead><tr><th>BL No</th><th>Trade flow</th><th>TF date</th><th className="num">Quantity</th><th className="num">Value (USD) · share</th></tr></thead>
            <tbody>{rows.map((b, k) => (
              <tr key={str(b.blNo)}>
                <td className="mono"><span className={`tsf-proposal__dot c${k % 6}`} aria-hidden="true" />{str(b.blNo)}</td>
                <td className="mono">{str(b.tfNo)}</td>
                <td>{formatDate(str(b.tfDate))}</td>
                <td className="num">{fmtQty(str(b.quantity))}</td>
                <td className="num">{formatAmount(str(b.usdValue))} <small className="tsf-proposal__share">{parts[k]?.pct ?? 0}%</small></td>
              </tr>
            ))}</tbody>
            <tfoot><tr><th colSpan={4}>Total</th><th className="num">{formatAmount(combo.totalUsd)}</th></tr></tfoot>
          </DataTable>
          </div>
        </section>
        <p className="tsf-proposal__note">Assigning writes Deal ID {deal.dealId} on these BLs and stores each BL's USD value with it. You can unassign a BL later on this screen.</p>
      </div>
    </Modal>
  );
}
