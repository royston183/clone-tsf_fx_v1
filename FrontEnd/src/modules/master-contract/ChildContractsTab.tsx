// The six child contracts of a master contract (T1/T2/T3, Sell and Purchase), derived from its FX model's entity string,
// as the reference builds them on create (ZSGTSFTR_MC_CHILD).
import { DataTable } from '@/components/table/DataTable';
import type { ObjectTabProps } from '../types';
import { modelOf } from './lookups';

const LEGS = [
  { type: 'T1S', side: 'Sell (02)', sell: 0, buy: 1, trade: 'T1', desc: [0, 1, 'S'] },
  { type: 'T1P', side: 'Purchase (01)', sell: 0, buy: 1, trade: 'T1', desc: [1, 0, 'P'] },
  { type: 'T2S', side: 'Sell (02)', sell: 1, buy: 2, trade: 'T2', desc: [1, 2, 'S'] },
  { type: 'T2P', side: 'Purchase (01)', sell: 1, buy: 2, trade: 'T2', desc: [2, 1, 'P'] },
  { type: 'T3S', side: 'Sell (02)', sell: 2, buy: 0, trade: 'T3', desc: [2, 0, 'S'] },
  { type: 'T3P', side: 'Purchase (01)', sell: 2, buy: 0, trade: 'T3', desc: [0, 2, 'P'] }
] as const;
const FIRST_REF: Record<string, number> = { T1: 110001, T2: 220001, T3: 330001 };

export function ChildContractsTab({ header }: ObjectTabProps) {
  const mc = String(header.mcNo ?? '');
  // The FX model's entity string, as stored with the contract (ZENT_DESC, e.g. 'OGA - DMCC - OSIPL'), else the sample's.
  const entities = String(header.entityDesc || modelOf(header.model)?.entityString || '').split('-').map(e => e.trim()).filter(Boolean);
  if (!mc || entities.length < 3) {
    return <p className="muted">The child contracts are created with the master contract, from its FX model's entity string.</p>;
  }
  const offset = Number(mc.slice(-3)) || 0;
  return (
    <div className="table-wrap ds-table-wrap">
      <DataTable aria-label="Child contracts" className="ds-table" columns={[{ kind: 'code' }, { kind: 'code' }, { kind: 'code' }, { kind: 'text' }, { kind: 'code' }, { kind: 'code' }, { kind: 'text' }, { kind: 'code' }]}>
        <thead><tr><th>Child Type</th><th>Child Contract No</th><th>Child Ref</th><th>Description</th><th>Sell</th><th>Buy</th><th>Side</th><th>Trade Type</th></tr></thead>
        <tbody>{LEGS.map(l => (
          <tr key={l.type}>
            <td className="ds-code">{l.type}</td>
            <td className="ds-code">{`2026 / ${mc} / ${l.type}`}</td>
            <td className="ds-code">{FIRST_REF[l.trade] + offset}</td>
            <td>{`${entities[l.desc[0]]}-${entities[l.desc[1]]}-${l.desc[2]}`}</td>
            <td className="ds-code">{entities[l.sell]}</td>
            <td className="ds-code">{entities[l.buy]}</td>
            <td>{l.side}</td>
            <td className="ds-code">{l.trade}</td>
          </tr>
        ))}</tbody>
      </DataTable>
    </div>
  );
}
