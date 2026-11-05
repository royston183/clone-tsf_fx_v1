export type TableKind = 'text' | 'code' | 'date' | 'number' | 'amount' | 'status' | 'flag' | 'actions';
export interface TableColumn {
  kind?: TableKind;
  align?: 'left' | 'right' | 'center';
  /** An application can pin an intentional width; otherwise visible content and type determine it. */
  width?: number;
  minWidth?: number;
}
export interface MeasuredColumn extends TableColumn { contentWidth: number; headerWidth: number }
export interface FittedColumn { kind: TableKind; align: 'left' | 'right' | 'center'; width: number }

/** Use a module/report's schema; never guess whether a business value is money from its label. */
export function columnsFor(columns: readonly { field?: string; id?: string; type?: string; code?: boolean; align?: 'left' | 'right'; width?: number; statusTone?: unknown }[], fields: AnyField[] = []): TableColumn[] {
  return columns.map(c => {
    const def = fields.find(d => d.field === (c.field ?? c.id));
    const type = c.type ?? (def ? typeOf(def) : undefined);
    const kind: TableKind | undefined = c.statusTone || def?.statusTone ? 'status' : type === 'amount' ? 'amount' : ['integer', 'decimal', 'percent', 'count', 'rate'].includes(type ?? '') ? 'number'
      : type === 'date' ? 'date' : ['flag', 'toggle'].includes(type ?? '') ? 'flag'
        : type === 'code' || c.code || (def?.max && def.max <= 12 && ['suggest', 'text'].includes(type ?? '')) ? 'code' : type ? 'text' : undefined;
    return { kind, align: c.align ?? (def && kind !== 'flag' ? behaviourOf(def).align : undefined), width: c.width ?? def?.width };
  });
}

const limits: Record<TableKind, [number, number]> = {
  text: [144, 360], code: [76, 240], date: [120, 168], number: [76, 180], amount: [128, 280], status: [100, 180], flag: [40, 56], actions: [40, 64]
};

/** Fit visible columns without stretching codes/dates, hiding data, or squeezing a wide table below usable widths. */
export function fitTableColumns(columns: MeasuredColumn[], available: number): FittedColumn[] {
  const sized = columns.map(c => {
    const kind = c.kind ?? 'text';
    const [floor, ceiling] = limits[kind];
    const naturalMin = Math.max(c.headerWidth, c.contentWidth);
    const min = Math.max(c.minWidth ?? 0, floor, naturalMin, c.width ?? 0);
    const max = c.width ?? Math.max(min, ceiling);
    const width = Math.max(min, Math.min(max, c.contentWidth));
    return { kind, align: c.align ?? (kind === 'number' || kind === 'amount' ? 'right' : kind === 'flag' || kind === 'actions' ? 'center' : 'left'), min, max, width };
  });
  let remaining = available - sized.reduce((sum, c) => sum + c.width, 0);
  if (remaining > 0) {
    let flexible = sized.filter(c => c.kind === 'text' && c.width < c.max);
    while (remaining > 0.1 && flexible.length) {
      const share = remaining / flexible.length;
      for (const c of flexible) { const add = Math.min(c.max - c.width, share); c.width += add; remaining -= add; }
      flexible = flexible.filter(c => c.width < c.max);
    }
    // Space still left once descriptions are full width: the table still spans its container, sharing it across the data
    // columns by their width (flags, actions and pinned widths stay), in whole pixels that add up to the container exactly.
    const spread = remaining > 0.5 ? sized.filter((c, i) => columns[i].width === undefined && c.kind !== 'flag' && c.kind !== 'actions') : [];
    if (spread.length) {
      for (const c of sized) c.width = Math.floor(c.width);
      let left = Math.floor(available) - sized.reduce((sum, c) => sum + c.width, 0);
      const total = spread.reduce((sum, c) => sum + c.width, 0);
      for (const c of spread) c.width += Math.floor(left * c.width / total);
      left = Math.floor(available) - sized.reduce((sum, c) => sum + c.width, 0);
      for (let i = 0; left > 0; i = (i + 1) % spread.length, left--) spread[i].width += 1;
    }
  } else if (remaining < 0) {
    for (const c of [...sized].sort((a, b) => (b.width - b.min) - (a.width - a.min))) {
      const take = Math.min(c.width - c.min, -remaining); c.width -= take; remaining += take;
      if (remaining >= 0) break;
    }
  }
  return sized.map(({ kind, align, width }) => ({ kind, align, width: Math.ceil(width) }));
}
import { behaviourOf, typeOf, type AnyField } from '@/lib/fields';
