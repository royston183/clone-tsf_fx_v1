// Display helpers of the FX screens: amounts with thousands grouping, rates to 4 (or 6) places, dates dd-mm-yyyy.
import { formatAmount, formatDate } from '@/lib/fields/parse';

export const amt = (v: number | string | null | undefined, dp = 2): string => {
  if (v === null || v === undefined || v === '') return '—';
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);
  const text = formatAmount(Math.abs(n).toFixed(dp));
  return n < 0 ? `-${text}` : text;
};
export const rate = (v: number | null | undefined, dp = 4): string => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(dp));
export const date = (iso: string | null | undefined): string => (iso ? formatDate(iso) : '—');
/** 1.2M / 845K: compact USD figures for KPI cards. */
export const compact = (n: number): string => {
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
};
export const isoToday = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const addDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
/** The next Monday–Friday on or after the date (the static holiday calendar of the reference is not modelled). */
export const workingDay = (iso: string): string => {
  let d = iso;
  for (let i = 0; i < 3 && [0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay()); i++) d = addDays(d, 1);
  return d;
};
