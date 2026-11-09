import { useState } from 'react';
import { Info } from 'lucide-react';
import { limitShare, tileTag } from '@/lib/dashboard/periods';
import type { Tile } from '@/lib/dashboard/types';
import type { LinkTarget, Unit } from '@/lib/report/types';
import { formatInUnit, formatPercent, unitName } from '@/lib/report/units';
import { ICONS } from '@/components/ui/icons';
import { Popover } from '@/components/ui/Popover';
import { TrafficLightTag } from '@/components/ui/Badge';
import { isLinkTarget } from '@/lib/drill/target';

/** A figure of a tile by its type: amounts in the unit, named when scaled, with the currency; percents unscaled; counts grouped. */
function figure(t: Tile, v: string, unit: Unit): string {
  if (t.type === 'amount') return [formatInUnit(v, unit), unitName(unit), t.currency ?? ''].filter(Boolean).join(' ');
  if (t.type === 'percent') return formatPercent(v);
  if (t.type === 'ratio') return `${Number(v).toFixed(2)}×`;
  return Number(v).toLocaleString('en-US');
}
/** An Overview card's value: the figure alone; an amount's currency and unit go on the line under it. */
function bare(t: Tile, unit: Unit): string {
  if (!t.value) return '—';
  if (t.type === 'amount') return formatInUnit(t.value, unit);
  if (t.type === 'percent') return `${inUnit1(t.value)}%`;
  return figure(t, t.value, unit);
}
const inUnit1 = (v: string) => (Number.isFinite(Number(v)) ? Number(v).toFixed(1) : v);
/** A tile's value as shown ('246.00 Lakhs INR', '-17.54 %', '20'); '—' without a value. */
export const tileValue = (t: Tile, unit: Unit): string => (t.value ? figure(t, t.value, unit) : '—');
/** The meter caption (ALM's limit note): the share of the limit used and the signed limit, '0 % of limit used · limit -10.00 %'. */
export const meterText = (t: Tile, unit: Unit): string =>
  (t.meter ? `${Math.round(limitShare(t.meter.value, t.meter.limit))} % of limit used · limit ${figure(t, t.meter.limit, unit)}` : '');
/** ALM's .ov-delta is green for 'up' and red for 'down': the class says whether the change is good. */
const deltaClass = (d: NonNullable<Tile['delta']>) => ((/^[-−]/.test(d.value.trim()) ? 'down' : 'up') === d.good ? 'up' : 'down');

/**
 * An Overview KPI card: label with its icon at the top right, the value, an amount's currency and unit, an optional
 * meter (green, amber or red by its RAG) and the note; the card opens its drill target.
 */
function KpiCard({ tile, unit, onOpen }: { tile: Tile; unit: Unit; onOpen?: (target: LinkTarget) => void }) {
  const target = isLinkTarget(tile.drill) && onOpen ? tile.drill : null;
  const tag = tileTag(tile);
  const Icon = tile.icon ? ICONS[tile.icon] : null;
  const used = tile.meter ? Math.min(100, limitShare(tile.meter.value, tile.meter.limit)) : null;
  const unitLine = tile.type === 'amount' ? [tile.currency, unitName(unit)].filter(Boolean).join(' · ') : '';
  return (
    <article className={`kit-ov-kpi ${target ? 'kit-tile-link' : ''}`} aria-label={tile.label} onClick={target ? () => onOpen?.(target) : undefined}>
      <span className="kit-ov-kpi-head">{target ? <button type="button" className="kit-tile-open" onClick={e => { e.stopPropagation(); onOpen?.(target); }}>{tile.label}</button> : <span>{tile.label}</span>}{Icon && <Icon size={16} aria-hidden="true" />}</span>
      <strong className={bare(tile, unit).length > 14 ? 'kit-ov-long-value' : undefined}>{bare(tile, unit)}</strong>
      {unitLine && <small className="kit-ov-kpi-unit">{unitLine}</small>}
      {used !== null && <span className={`kit-ov-meter ${tile.rag ?? 'blue'}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(used)} aria-label={`${tile.label}: ${Math.round(used)} % of the limit`}><i style={{ width: `${used}%` }} /></span>}
      {tag && <span><TrafficLightTag tone={tag.tone}>{tag.label}</TrafficLightTag></span>}
      {tile.note && <small className="kit-ov-kpi-note">{tile.note}</small>}
    </article>
  );
}

/** A KPI tile (spec §6.3, ALM .ov-tile): value, limit meter, RAG badge, delta, info pop-over and click-through. On an Overview: the KPI card. */
export function KpiTile({ tile, unit, onOpen, layout }: { tile: Tile; unit: Unit; onOpen?: (target: LinkTarget) => void; layout?: 'overview' }) {
  return layout === 'overview' ? <KpiCard tile={tile} unit={unit} onOpen={onOpen} /> : <AlmTile tile={tile} unit={unit} onOpen={onOpen} />;
}
function AlmTile({ tile, unit, onOpen }: { tile: Tile; unit: Unit; onOpen?: (target: LinkTarget) => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const target = isLinkTarget(tile.drill) && onOpen ? tile.drill : null;
  const used = tile.meter ? Math.min(100, limitShare(tile.meter.value, tile.meter.limit)) : null;
  const tag = tileTag(tile);
  const cls = ['panel', 'ov-tile', tag?.tone ?? tile.rag, target ? 'kit-tile-link' : ''].filter(Boolean).join(' ');
  return (
    <div className={cls} onClick={target ? () => onOpen?.(target) : undefined}>
      {target
        ? <button type="button" className="ov-tile-k kit-tile-open" onClick={e => { e.stopPropagation(); onOpen?.(target); }}>{tile.label}</button>
        : <span className="ov-tile-k">{tile.label}</span>}
      <b>{tileValue(tile, unit)}</b>
      {used !== null && <div className="ov-util" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(used)} aria-label={`Limit used ${Math.round(used)} %`}><i style={{ width: `${used}%` }} /></div>}
      {tag && <TrafficLightTag tone={tag.tone}>{tag.label}</TrafficLightTag>}
      {tile.meter && <small>{meterText(tile, unit)}</small>}
      {tile.delta && <small className={`ov-delta ${deltaClass(tile.delta)}`}>{tile.delta.value}</small>}
      {tile.info && <button type="button" className="ov-tile-info" aria-label={`About ${tile.label}`} aria-expanded={Boolean(anchor)}
        onClick={e => { e.stopPropagation(); const el = e.currentTarget; setAnchor(a => (a ? null : el)); }}><Info size={12} strokeWidth={2.5} /></button>}
      {anchor && tile.info && <Popover anchor={anchor} onClose={() => setAnchor(null)}>
        <div className="ov-info-body" onClick={e => e.stopPropagation()}><b>{tile.label}</b><p>{tile.info}</p></div>
      </Popover>}
    </div>
  );
}
