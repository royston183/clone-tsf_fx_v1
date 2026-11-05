import { Building2 } from 'lucide-react';
import type { Entity } from '@/lib/dashboard/types';
import type { LinkTarget, Unit } from '@/lib/report/types';
import { formatInUnit, sumAmounts, unitName } from '@/lib/report/units';
import { isLinkTarget } from '@/lib/drill/target';

/** One card per entity (company code): its amount, share of all, and a row of figures; a card opens its drill target. */
export function EntityCards({ entities, unit, currency, onOpen }: { entities: Entity[]; unit: Unit; currency?: string; onOpen?: (target: LinkTarget) => void }) {
  const all = Number(sumAmounts(entities.map(e => e.amount))) || 0;
  return (
    <section className="kit-ov-entities" aria-label="Company codes">
      {entities.map(e => {
        const target = isLinkTarget(e.drill) && onOpen ? e.drill : null;
        const share = all ? `${((Number(e.amount) / all) * 100).toFixed(1)}% of total` : '';
        const body = <>
          <span className="kit-ov-entity-head"><Building2 size={15} aria-hidden="true" /><b>{e.code}</b><span>{e.name}</span>{share && <small>{share}</small>}</span>
          <strong>{formatInUnit(e.amount, unit)}</strong>
          <small>{[e.label ?? 'Amount', currency, unitName(unit)].filter(Boolean).join(' · ')}</small>
          <span className="kit-ov-entity-stats">{e.stats.map(s => <span key={s.label}><small>{s.label}</small><b>{s.value}</b></span>)}</span>
        </>;
        return target
          ? <button key={e.code} type="button" className="kit-ov-entity" onClick={() => onOpen?.(target)} aria-label={`${e.code} ${e.name}: ${target.label}`}>{body}</button>
          : <div key={e.code} className="kit-ov-entity">{body}</div>;
      })}
    </section>
  );
}
