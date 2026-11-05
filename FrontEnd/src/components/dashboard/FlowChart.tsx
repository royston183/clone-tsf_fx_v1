import type { ReactNode } from 'react';
import type { FlowBox, FlowItem, FlowStep } from '@/lib/dashboard/types';
import type { LinkTarget } from '@/lib/report/types';
import { isLinkTarget } from '@/lib/drill/target';

type Open = (target: LinkTarget) => void;

/** A box of the chart: a link when it has a drill target, with its amount (or count) badge at the bottom right. */
function Box({ className, box, badge, onOpen, children }: { className: string; box: { drill?: FlowBox['drill'] }; badge?: string; onOpen?: Open; children: ReactNode }) {
  const target = isLinkTarget(box.drill) && onOpen ? box.drill : null;
  const inner = <>{children}{badge && <span className="kit-flow-badge">{badge}</span>}</>;
  return target
    ? <button type="button" className={className} onClick={() => onOpen?.(target)} title={target.label}>{inner}</button>
    : <div className={className}>{inner}</div>;
}

/**
 * A process as SAP Reporting draws its group structure: a top box, connector lines down to one column per step (its box
 * with its amount, a "STEP n" pill) and, when expanded, the step's open items as cards under it with their counts.
 */
export function FlowChart({ label, root, steps, format, expanded, onOpen }: {
  label: string; root: FlowBox; steps: FlowStep[]; format: (v: string) => string; expanded: boolean; onOpen?: Open;
}) {
  const amount = (v?: string) => (v ? format(v) || '—' : undefined);
  return (
    <div className="kit-flow" role="group" aria-label={label}>
      <div className="kit-flow-root">
        <Box className="kit-flow-box kit-flow-top" box={root} badge={amount(root.amount)} onOpen={onOpen}><small>{root.label}</small><b>{root.title}</b>{root.note && <span>{root.note}</span>}</Box>
      </div>
      <div className="kit-flow-stem" aria-hidden="true" />
      <div className="kit-flow-steps" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(150px, 1fr))` }}>
        {steps.map((s, i) => (
          <div key={s.label} className="kit-flow-col">
            <span className="kit-flow-pill">Step {i + 1}</span>
            <Box className={`kit-flow-box kit-flow-step ${s.tone ?? 'blue'}`} box={s} badge={amount(s.amount)} onOpen={onOpen}><small>{s.label}</small><b>{s.title}</b>{s.note && <span>{s.note}</span>}</Box>
            {expanded && s.items.map((item: FlowItem) => (
              <Box key={item.name} className="kit-flow-box kit-flow-item" box={item} badge={item.badge} onOpen={onOpen}>
                <b>{item.name}</b><span>{item.tag && <em>{item.tag}</em>} {amount(item.amount)}</span>
              </Box>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
