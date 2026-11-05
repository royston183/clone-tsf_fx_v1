import type { BarItem } from '@/lib/dashboard/types';
import type { LinkTarget } from '@/lib/report/types';
import { sumAmounts } from '@/lib/report/units';
import { isLinkTarget } from '@/lib/drill/target';

/** Horizontal bars, largest first: label and note, a bar scaled to the largest, the amount and its share of the total. */
export function BarList({ label, items, format, onOpen }: { label: string; items: BarItem[]; format: (v: string) => string; onOpen?: (target: LinkTarget) => void }) {
  if (!items.length) return <p className="kit-ov-empty">No figures for this selection.</p>;
  const total = Number(sumAmounts(items.map(i => i.value))) || 0;
  const top = Math.max(...items.map(i => Number(i.value) || 0), 0);
  return (
    <ol className="kit-ov-bars" aria-label={label}>
      {items.map(i => {
        const target = isLinkTarget(i.drill) && onOpen ? i.drill : null;
        const name = target ? <button type="button" className="kit-ov-link" onClick={() => onOpen?.(target)}>{i.label}</button> : <span>{i.label}</span>;
        return (
          <li key={i.label}>
            <span className="kit-ov-bar-label">{name}{i.note && <small>{i.note}</small>}</span>
            <span className="kit-ov-bar-track" aria-hidden="true"><i style={{ width: `${top ? Math.max(1, ((Number(i.value) || 0) / top) * 100) : 0}%` }} /></span>
            <span className="kit-ov-bar-value"><b>{format(i.value)}</b><small>{total ? `${(((Number(i.value) || 0) / total) * 100).toFixed(1)}%` : ''}</small></span>
          </li>
        );
      })}
    </ol>
  );
}
