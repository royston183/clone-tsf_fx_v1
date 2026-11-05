// A reference menu tile for which the reference application has no implemented React screen.
import { TrafficLightTag } from '@/components/ui/Badge';
import type { CustomPageProps } from '@/pages/registry';
import './planned.css';

export default function PlannedPage({ node, trail }: CustomPageProps) {
  const path = trail.slice(0, -1).map(n => n.title).join(' › ');
  return (
    <section className="panel tsf-planned" aria-labelledby="tsf-planned-title">
      <div className="tsf-planned__head">
        <div>
          <p className="tsf-planned__path">{path}</p>
          <h2 id="tsf-planned-title">{node.title}</h2>
        </div>
        <TrafficLightTag tone="amber">Not implemented in reference</TrafficLightTag>
      </div>
      <dl className="tsf-planned__facts">
        {node.tcode && <div><dt>SAP transaction</dt><dd className="mono">{node.tcode}</dd></div>}
        <div><dt>Status</dt><dd>The reference application has no implemented screen for this menu entry.</dd></div>
      </dl>
      <p className="tsf-planned__note">{node.description}</p>
    </section>
  );
}
