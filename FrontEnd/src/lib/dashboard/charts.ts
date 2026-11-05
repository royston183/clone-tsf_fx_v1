// Scales and SVG paths of the hand-drawn dashboard charts (spec §6.3), ported from ALM src/pages/overview/trends.jsx. Pure.
import { formatAmount } from '@/lib/fields/parse';

const r2 = (n: number) => Math.round(n * 100) / 100;
/** A tick without binary float noise (0.6000000000000001 → 0.6). */
const clean = (n: number) => Number(n.toPrecision(12));

/** Rounded axis ticks covering [min, max]: steps of 1, 2, 2.5, 5 or 10 times a power of ten. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || Math.abs(max) || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(f => f * mag).find(s => s >= raw) ?? 10 * mag;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(clean(Math.round(v / step) * step));
  return out;
}

/** Ticks of a chart over its values and limit line: zero always in, 12 % headroom beyond the extremes. */
export function chartTicks(values: number[], limit: number | null = null): number[] {
  const all = limit === null ? values : [...values, limit];
  const lo0 = Math.min(0, ...all), hi0 = Math.max(0, ...all);
  const pad = (hi0 - lo0) * 0.12;
  return niceTicks(lo0 < 0 ? lo0 - pad : 0, hi0 > 0 ? hi0 + pad : 0);
}

/** The decimals (0–2) the ticks need once divided by `divisor`: 0, 2, 4 → 0; 0.2, 0.4 → 1; 0.02 (2 lakh in crores) → 2. */
export function tickDecimals(ticks: number[], divisor = 1): number {
  for (let d = 0; d < 2; d++) if (ticks.every(t => Math.abs(clean((t / divisor) * 10 ** d) % 1) < 1e-9)) return d;
  return 2;
}

/** An axis label: the tick in the unit (`divisor`) with the decimals its step needs and en-IN grouping. */
export const axisLabel = (t: number, ticks: number[], divisor = 1): string => formatAmount(clean(t / divisor).toFixed(tickDecimals(ticks, divisor)));

/** Value → y pixel: the last tick at `top`, the first at `top + height`. */
export function yScale(ticks: number[], top: number, height: number): (v: number) => number {
  const y0 = ticks[0] ?? 0, y1 = ticks[ticks.length - 1] ?? 0;
  return v => top + (height * (y1 - v)) / (y1 - y0 || 1);
}

/** A bar with its data end (away from zero) rounded, square on the zero line; a flat line when under half a pixel. */
export function barPath(x: number, w: number, yZero: number, yVal: number): string {
  const h = Math.abs(yVal - yZero), r = Math.min(4, w / 2, h);
  const [X, W, Z, V, R] = [x, w, yZero, yVal, r].map(r2);
  if (h < 0.5) return `M${X},${Z}h${W}`;
  const edge = yVal < yZero ? r2(V + R) : r2(V - R);
  return `M${X},${Z}V${edge}Q${X},${V} ${r2(X + R)},${V}H${r2(X + W - R)}Q${r2(X + W)},${V} ${r2(X + W)},${edge}V${Z}Z`;
}

export const polylinePoints = (points: { x: number; y: number }[]): string => points.map(p => `${r2(p.x)},${r2(p.y)}`).join(' ');

export interface Arc { d: string; share: number }
/** Donut slices of the positive values, clockwise from the top; a zero or negative value gets no arc. */
export function donutArcs(values: number[], cx: number, cy: number, inner: number, outer: number): Arc[] {
  const total = values.reduce((s, v) => s + (v > 0 ? v : 0), 0);
  const p = (r: number, a: number) => `${r2(cx + r * Math.cos(a))},${r2(cy + r * Math.sin(a))}`;
  let a0 = -Math.PI / 2;
  return values.map(v => {
    if (!(v > 0) || !total) return { d: '', share: 0 };
    const share = v / total;
    if (share > 0.9999) {
      return { d: `M${p(outer, a0)} A${outer},${outer} 0 0 1 ${p(outer, a0 + Math.PI)} A${outer},${outer} 0 0 1 ${p(outer, a0)} L${p(inner, a0)} A${inner},${inner} 0 0 0 ${p(inner, a0 + Math.PI)} A${inner},${inner} 0 0 0 ${p(inner, a0)} Z`, share };
    }
    const a1 = a0 + share * 2 * Math.PI;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const d = `M${p(outer, a0)} A${outer},${outer} 0 ${large} 1 ${p(outer, a1)} L${p(inner, a1)} A${inner},${inner} 0 ${large} 0 ${p(inner, a0)} Z`;
    a0 = a1;
    return { d, share };
  });
}
