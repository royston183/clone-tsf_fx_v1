import type { SharePart } from '@/lib/dashboard/types';
import { sumAmounts } from '@/lib/report/units';

const TONES: NonNullable<SharePart['tone']>[] = ['green', 'blue', 'amber', 'orange', 'red', 'grey'];

/** One 100 % bar of parts with a legend: each part's share, amount and count (a breakdown such as days past due). */
export function ShareBar({ label, parts, format }: { label: string; parts: SharePart[]; format: (v: string) => string }) {
  const total = Number(sumAmounts(parts.map(p => p.value))) || 0;
  const share = (p: SharePart) => (total ? ((Number(p.value) || 0) / total) * 100 : 0);
  const tone = (p: SharePart, i: number) => `kit-tone-${p.tone ?? TONES[i % TONES.length]}`;
  if (!total) return <p className="kit-ov-empty">No figures for this selection.</p>;
  return (
    <div className="kit-ov-share">
      <div className="kit-ov-share-bar" role="img" aria-label={`${label}: ${parts.map(p => `${p.label} ${share(p).toFixed(1)} percent`).join(', ')}`}>
        {parts.map((p, i) => (share(p) > 0 ? <span key={p.label} className={tone(p, i)} style={{ flexGrow: share(p) }} title={`${p.label}: ${share(p).toFixed(1)}%`} /> : null))}
      </div>
      <ul className="kit-ov-share-legend">
        {parts.map((p, i) => (
          <li key={p.label}><span><i className={tone(p, i)} aria-hidden="true" />{p.label}</span><b>{share(p).toFixed(1)}%</b><span>{format(p.value)}</span><small>{p.count ?? ''}</small></li>
        ))}
      </ul>
    </div>
  );
}
