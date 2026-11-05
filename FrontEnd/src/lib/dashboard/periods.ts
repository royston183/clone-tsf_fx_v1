// Periods of a dashboard (spec §6): month and quarter labels, the months of a trend range (quarters follow the
// definition's quarterStartMonth) and the RAG rule of a mismatch % against its limit. Pure; used by server parts.
import type { Rag, Range, Tile } from './types';

export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const RAG_LABEL: Record<Rag, string> = { green: 'Within limit', amber: 'Near limit', red: 'Breach' };
/** The wording of a rag without a limit meter. */
export const RAG_NEUTRAL_LABEL: Record<Rag, string> = { green: 'On track', amber: 'Attention', red: 'Action needed' };
/** A tile's tag (label and tone): its own `tag`, else its `rag` worded as a limit with a meter and neutrally without; null without either. */
export function tileTag(t: Tile): { label: string; tone: Rag } | null {
  if (t.tag) return t.tag;
  if (!t.rag) return null;
  return { label: (t.meter ? RAG_LABEL : RAG_NEUTRAL_LABEL)[t.rag], tone: t.rag };
}

export const monthLabel = (month: string, year: string): string => `${MONTH_SHORT[Number(month) - 1] ?? month} ${year.slice(2)}`;

/** "Q4 FY25": the quarter counted from quarterStartMonth; the financial year is named after the year it ends in. */
export function quarterLabel(month: string, year: string, quarterStartMonth = 1): string {
  const m = Number(month);
  const q = Math.floor(((m - quarterStartMonth + 12) % 12) / 3) + 1;
  const fy = quarterStartMonth === 1 ? Number(year) : Number(year) + (m >= quarterStartMonth ? 1 : 0);
  return `Q${q} FY${String(fy % 100).padStart(2, '0')}`;
}

const at = (i: number) => ({ month: String((i % 12) + 1).padStart(2, '0'), year: String(Math.floor(i / 12)) });
const indexOf = (month: string, year: string) => Number(year) * 12 + Number(month) - 1;

export const previousPeriod = (month: string, year: string): { month: string; year: string } => at(indexOf(month, year) - 1);

/** The periods of a trend ending with the selected month: the last 3/6/12 months, or the last four quarter-end months. */
export function periodsOf(month: string, year: string, range: Range, quarterStartMonth = 1): { month: string; year: string }[] {
  const end = indexOf(month, year);
  if (range !== '4q') {
    const n = Number(range.slice(0, -1));
    return Array.from({ length: n }, (_, k) => at(end - n + 1 + k));
  }
  const ends: number[] = [];
  for (let i = end; ends.length < 4; i--) {
    const m = (i % 12) + 1;
    if (((m - quarterStartMonth + 12) % 12) % 3 === 2) ends.unshift(i);
  }
  return ends.map(at);
}

/** The share of a limit used, in % (unrounded, may pass 100): value / limit for the same sign, 0 when the signs differ. */
export function limitShare(value: string, limit: string): number {
  const v = Number(value), l = Number(limit);
  if (!Number.isFinite(v) || !Number.isFinite(l) || l === 0) return 0;
  return Math.max(0, (v / l) * 100);
}

/** RAG of a cumulative mismatch % against a −limit %: red beyond the limit, amber from `amberFrom` % of it. */
export function ragOf(pct: number, limit: number, amberFrom = 80): Rag {
  const used = (Math.max(0, -pct) / limit) * 100;
  return used > 100 ? 'red' : used >= amberFrom ? 'amber' : 'green';
}
