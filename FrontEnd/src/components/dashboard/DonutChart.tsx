import { useState } from 'react';
import { donutArcs } from '@/lib/dashboard/charts';
import type { Slice } from '@/lib/dashboard/types';
import { sumAmounts } from '@/lib/report/units';

interface DonutProps { label: string; slices: Slice[]; format: (v: string) => string; note?: string; /** The centre's caption without a hovered slice (default Total). */ total?: string }

/**
 * ALM's donut (overview/answer.jsx Pie, `.ov-ch-pie`): slices in the chart colours, the total or the hovered slice in the
 * middle, a legend with shares; the hovered slice and its legend row carry `on` (ALM dims the others). Stateless.
 */
export function DonutPie({ label, slices, format, hover, onHover, total: caption = 'Total' }: DonutProps & { hover: number | null; onHover: (i: number | null) => void }) {
  const arcs = donutArcs(slices.map(s => Number(s.value) || 0), 100, 100, 50, 80);
  const total = sumAmounts(slices.map(s => s.value));
  const shown = hover !== null ? slices[hover] : undefined;
  const tone = (i: number) => `ov-ch-c${(i % 5) + 1}`;
  return (
    <div className="ov-ch-pie">
      <svg viewBox="0 0 200 200" role="img" aria-label={`${label}: ${slices.map(s => `${s.label} ${format(s.value)}`).join(', ')}`}>
        {arcs.map((a, i) => (a.d ? <path key={slices[i].label} className={hover === i ? `${tone(i)} on` : tone(i)} d={a.d} onMouseEnter={() => onHover(i)} onMouseLeave={() => onHover(null)}>
          <title>{`${slices[i].label}: ${format(slices[i].value)}`}</title></path> : null))}
        <text x="100" y="98" textAnchor="middle" className="ov-ch-pie-k">{shown ? shown.label : caption}</text>
        <text x="100" y="114" textAnchor="middle" className="ov-ch-pie-v" textLength={format(shown ? shown.value : total).length > 12 ? 88 : undefined} lengthAdjust={format(shown ? shown.value : total).length > 12 ? 'spacingAndGlyphs' : undefined}>{format(shown ? shown.value : total)}</text>
      </svg>
      <ul className="ov-ch-legend">{slices.map((s, i) => (
        <li key={s.label} className={hover === i ? 'on' : undefined} onMouseEnter={() => onHover(i)} onMouseLeave={() => onHover(null)}>
          <i className={`ov-ch-key ${tone(i)}`} /><span>{s.label}</span><b>{format(s.value)}</b><small>{`${(arcs[i].share * 100).toFixed(1)} %`}</small>
        </li>
      ))}</ul>
    </div>
  );
}

/** A donut of shares; no slices, or none above zero (all-zero data), shows the empty-state text instead of an empty ring. */
export function DonutChart({ label, slices, format, note, total }: DonutProps) {
  const [hover, setHover] = useState<number | null>(null);
  const empty = !donutArcs(slices.map(s => Number(s.value) || 0), 100, 100, 50, 80).some(a => a.d);
  return (
    <figure className="ov-ch">
      {note && !empty && <figcaption>{note}</figcaption>}
      {empty ? <p className="ov-tempty">No figures for this period.</p> : <DonutPie label={note ? `${label} (${note})` : label} slices={slices} format={format} hover={hover} onHover={setHover} total={total} />}
    </figure>
  );
}
