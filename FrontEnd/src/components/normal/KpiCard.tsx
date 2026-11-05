// The Normal theme's KPI card (LAS StatCard): a headline figure with its label, caption and icon. `tone` colours the
// label's dot, the icon tile and the accent rail; `featured` makes the one figure a page leads with a blue card.
import type { ReactNode } from 'react';
import type { IconName } from '@/config/catalog';
import { ICONS } from '@/components/ui/icons';

export type KpiTone = 'blue' | 'green' | 'amber' | 'red' | 'navy';

export function KpiCard({ title, value, caption, icon, tone = 'blue', featured }: {
  title: string; value: ReactNode; caption?: string; icon?: IconName; tone?: KpiTone; featured?: boolean;
}) {
  const Icon = icon ? ICONS[icon] : null;
  return (
    <div className={`nt-stat nt-tone-${tone}${featured ? ' nt-featured' : ''}`}>
      <div>
        <span><i className="nt-stat-dot" aria-hidden="true" />{title}</span>
        {Icon && <i className={`nt-tone-icon nt-icon-${tone}`}><Icon size={18} aria-hidden="true" /></i>}
      </div>
      <strong>{value}</strong>
      {caption && <small>{caption}</small>}
    </div>
  );
}
