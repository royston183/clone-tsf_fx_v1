// A row of key-figure cards for the FX custom pages; a card with onClick filters or opens its breakdown.
import type { ReactNode } from 'react';

export interface FxKpi { id: string; label: string; value: ReactNode; note?: ReactNode; tone?: 'blue' | 'green' | 'amber' | 'red' | 'grey' | 'purple'; active?: boolean; onClick?: () => void }

export function FxKpis({ items, label }: { items: FxKpi[]; label: string }) {
  return (
    <div className="tsf-kpis" role="list" aria-label={label}>
      {items.map(k => {
        const body = <><span className="tsf-kpi__label">{k.label}</span><strong className="tsf-kpi__value">{k.value}</strong>{k.note && <span className="tsf-kpi__note">{k.note}</span>}</>;
        return <div role="listitem" key={k.id}>{k.onClick
          ? <button type="button" className={`tsf-kpi tsf-kpi--${k.tone ?? 'blue'}${k.active ? ' is-active' : ''}`} aria-pressed={k.active} onClick={k.onClick}>{body}</button>
          : <div className={`tsf-kpi tsf-kpi--${k.tone ?? 'blue'}`}>{body}</div>}</div>;
      })}
    </div>
  );
}
