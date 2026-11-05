import { useState, type MouseEvent } from 'react';
import { chartTicks, polylinePoints } from '@/lib/dashboard/charts';
import { useWidth } from '@/lib/client/use-width';
import { plotScale, type ChartProps } from './BarChart';

const H = 180, PAD = { l: 64, r: 16, t: 12, b: 26 };
const tone = (k: number) => `ov-ch-c${(k % 5) + 1}`;

/** Lines over periods with ALM's chart colours (.ov-ch-c1…5), a legend, a cross-hair and a tooltip. */
export function LineChart({ label, series, format, axisFormat, note }: ChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const labels = series[0]?.points.map(p => p.x) ?? [];
  const values = series.map(s => s.points.map(p => (p.y === '' ? null : Number(p.y))));
  const all = values.flat().filter((v): v is number => v !== null && !Number.isNaN(v));
  const ticks = chartTicks(all);
  const iw = Math.max(0, width - PAD.l - PAD.r), ih = H - PAD.t - PAD.b, n = labels.length;
  const step = n > 1 ? iw / (n - 1) : 0;
  const x = (i: number) => PAD.l + (n > 1 ? step * i : iw / 2);
  const y = plotScale(ticks, PAD.t, ih);
  const pick = (e: MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHover(n > 1 ? Math.max(0, Math.min(n - 1, Math.round((e.clientX - r.left - PAD.l) / step))) : 0);
  };
  return (
    <figure className="ov-ch">
      {note && <figcaption>{note}</figcaption>}
      {series.length > 1 && <ul className="ov-ch-legend row">{series.map((s, k) => <li key={s.name} className={tone(k)}><i className="ov-ch-key" />{s.name}</li>)}</ul>}
      <div ref={ref} className="ov-ch-plot" onMouseLeave={() => setHover(null)}>
        {width > 0 && all.length > 0 && <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="img" onMouseMove={pick}
          aria-label={`${label}${note ? ` (${note})` : ''}: ${series.map(s => `${s.name} ${s.points.map(p => `${p.x} ${p.y === '' ? 'no data' : format(p.y)}`).join(', ')}`).join('; ')}`}>
          <g className="ov-ch-axis">
            {ticks.map(t => <g key={t}><line x1={PAD.l} x2={width - PAD.r} y1={y(t)} y2={y(t)} className={t === 0 ? 'zero' : undefined} />
              <text x={PAD.l - 8} y={y(t)} dy="0.32em" textAnchor="end">{axisFormat(t, ticks)}</text></g>)}
            {labels.map((l, i) => <text key={`${l}${i}`} x={x(i)} y={H - 8} textAnchor="middle">{l}</text>)}
          </g>
          {hover !== null && <line className="ov-ch-cross" x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={PAD.t + ih} />}
          {series.map((s, k) => {
            const pts = values[k].flatMap((v, i) => (v === null || Number.isNaN(v) ? [] : [{ x: x(i), y: y(v) }]));
            return <g key={s.name} className={tone(k)}><polyline fill="none" points={polylinePoints(pts)} />{pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={3} />)}</g>;
          })}
        </svg>}
        {width > 0 && !all.length && <p className="ov-tempty">No figures for these periods.</p>}
        {hover !== null && all.length > 0 && <div className="ov-ch-tip" style={{ left: Math.min(Math.max(x(hover), 90), Math.max(90, width - 90)) }}>
          <b>{labels[hover]}</b>
          {series.map((s, k) => { const p = s.points[hover]; return <span key={s.name} className={tone(k)}><i className="ov-ch-key" />{`${s.name}: ${p && p.y !== '' ? format(p.y) : '—'}`}</span>; })}
        </div>}
      </div>
    </figure>
  );
}
