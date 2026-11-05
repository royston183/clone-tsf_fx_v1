import { useId, useState, type MouseEvent } from 'react';
import { barPath, chartTicks, yScale } from '@/lib/dashboard/charts';
import { RAG_LABEL } from '@/lib/dashboard/periods';
import type { Series } from '@/lib/dashboard/types';
import { useWidth } from '@/lib/client/use-width';

export interface ChartProps {
  label: string;
  series: Series[];
  format: (v: string) => string;
  /** A tick label; `ticks` are all ticks of the axis (their step decides the decimals). */
  axisFormat: (v: number, ticks: number[]) => string;
  /** The display unit of scaled amounts ("Amounts in Lakhs"), shown under the chart head as ALM's chart subtitle. */
  note?: string;
}

/**
 * Value → y pixel of a bar or line chart. With a single tick (every value zero: chartTicks gives [0]) the zero line sits
 * at the bottom of the plot, so zero bars and points rest on the axis instead of hanging from the top.
 */
export function plotScale(ticks: number[], top: number, height: number): (v: number) => number {
  return ticks.length > 1 ? yScale(ticks, top, height) : () => top + height;
}

const H = 170, PAD = { l: 56, r: 14, t: 12, b: 26 };
const TONES = ['s1', 's2'] as const;
const num = (y: string) => (y === '' ? null : Number(y));

/** Bars over periods (ALM overview trends): light-blue gradients, a limit line, tooltips; amber/red outlines from the server. */
export function BarChart({ label, series, format, axisFormat, note }: ChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const id = `kb${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const labels = series[0]?.points.map(p => p.x) ?? [];
  const values = series.map(s => s.points.map(p => num(p.y)));
  const limitText = series.find(s => s.limit)?.limit;
  const limit = limitText ? Number(limitText) : null;
  const all = values.flat().filter((v): v is number => v !== null && !Number.isNaN(v));
  const ticks = chartTicks(all, limit);
  const iw = Math.max(0, width - PAD.l - PAD.r), ih = H - PAD.t - PAD.b, n = labels.length, band = iw / Math.max(1, n);
  const gap = 2, groupW = Math.min(band * 0.62, 26 * series.length + gap), bw = (groupW - gap * (series.length - 1)) / Math.max(1, series.length);
  const cx = (i: number) => PAD.l + band * i + band / 2;
  const y = plotScale(ticks, PAD.t, ih);
  const flagged = series.some(s => s.points.some(p => p.status));
  const pick = (e: MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHover(Math.max(0, Math.min(n - 1, Math.floor((e.clientX - r.left - PAD.l) / (band || 1)))));
  };
  return (
    <figure className="ov-tchart">
      {(series.length > 1 || limit !== null || flagged || note) && <figcaption>{note && <small>{note}</small>}<span className="ov-tlegend">
        {series.length > 1 && series.map((s, k) => <span key={s.name}><i className={`ov-tkey ${TONES[k % 2]}`} />{s.name}</span>)}
        {limitText && <span><i className="ov-tlimit-k" />{`Limit ${format(limitText)}`}</span>}
        {flagged && <><span><i className="ov-tkey out amber" />Near limit</span><span><i className="ov-tkey out red" />Breach</span></>}
      </span></figcaption>}
      <div ref={ref} className="ov-tplot" onMouseLeave={() => setHover(null)}>
        {width > 0 && all.length > 0 && <svg width={width} height={H} role="img" onMouseMove={pick}
          aria-label={`${label}${note ? ` (${note})` : ''}: ${series.map(s => `${s.name} ${s.points.map(p => `${p.x} ${p.y === '' ? 'no data' : format(p.y)}`).join(', ')}`).join('; ')}`}>
          <defs>{series.map((s, k) => <linearGradient key={s.name} id={`${id}-${k}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className={`ov-gs ${TONES[k % 2]} a`} /><stop offset="1" className={`ov-gs ${TONES[k % 2]} b`} /></linearGradient>)}</defs>
          {hover !== null && <rect x={PAD.l + band * hover + 2} width={Math.max(0, band - 4)} y={PAD.t} height={ih} rx="4" className="ov-thover" />}
          {ticks.map(t => <g key={t}><line x1={PAD.l} x2={width - PAD.r} y1={y(t)} y2={y(t)} className={t === 0 ? 'ov-tzero' : 'ov-tgrid'} />
            <text x={PAD.l - 8} y={y(t)} dy="0.32em" textAnchor="end" className="ov-tax">{axisFormat(t, ticks)}</text></g>)}
          {labels.map((l, i) => <text key={`${l}${i}`} x={cx(i)} y={H - 8} textAnchor="middle" className="ov-tax">{l}</text>)}
          {series.map((s, k) => s.points.map((p, i) => {
            const v = values[k][i];
            if (v === null || Number.isNaN(v)) return null;
            const x = cx(i) - groupW / 2 + k * (bw + gap);
            return <path key={`${k}-${i}`} d={barPath(x, bw, y(0), y(v))} fill={`url(#${id}-${k})`} className={p.status ? `ov-tbar out ${p.status}` : 'ov-tbar'} />;
          }))}
          {limit !== null && <line x1={PAD.l} x2={width - PAD.r} y1={y(limit)} y2={y(limit)} className="ov-tlimit" />}
        </svg>}
        {width > 0 && !all.length && <p className="ov-tempty">No figures for these periods.</p>}
        {hover !== null && all.length > 0 && <div className="ov-ttip" style={{ left: Math.min(Math.max(cx(hover), 90), Math.max(90, width - 90)) }}>
          <b>{labels[hover]}</b>
          {series.map((s, k) => {
            const p = s.points[hover];
            return <span key={s.name}>{series.length > 1 && <i className={`ov-tkey ${TONES[k % 2]}`} />}{`${series.length > 1 ? `${s.name}: ` : ''}${p && p.y !== '' ? format(p.y) : '—'}${p?.status ? ` · ${RAG_LABEL[p.status]}` : ''}`}</span>;
          })}
        </div>}
      </div>
    </figure>
  );
}
