import { ArrowRight, FileBarChart2, ListChecks, Network } from 'lucide-react';
import { TrafficLightTag } from '@/components/ui/Badge';

/** A connected overview of the actual selection, report and output, available before the first run too. */
export function ReportOverview({ title, selection, output, loading = false, ready = false, error = false }: {
  title: string; selection: string; output: string; loading?: boolean; ready?: boolean; error?: boolean;
}) {
  const tone = error ? 'red' : loading || !ready ? 'amber' : 'green';
  const status = error ? 'Needs attention' : loading ? 'Running' : ready ? 'Ready' : 'Awaiting run';
  return <section className="panel kit-report-overview" aria-label="Report overview">
    <div className="kit-overview-head"><h2><Network size={16} />Report overview</h2><TrafficLightTag tone={tone}>{status}</TrafficLightTag></div>
    <ol className="kit-report-flow" aria-label={`${title} flow`}>
      <li><span className="kit-flow-icon"><ListChecks size={18} /></span><div><small>01 · Selection</small><b>Report inputs</b><p>{selection || 'Choose your report inputs'}</p></div></li>
      <li className="kit-flow-link" aria-hidden="true"><ArrowRight size={18} /></li>
      <li><span className="kit-flow-icon"><FileBarChart2 size={18} /></span><div><small>02 · Report</small><b>{title}</b><p>{loading ? 'Preparing your results…' : 'Run with the selected inputs'}</p></div></li>
      <li className="kit-flow-link" aria-hidden="true"><ArrowRight size={18} /></li>
      <li><span className="kit-flow-icon"><Network size={18} /></span><div><small>03 · Explore</small><b>Report results</b><p>{error ? 'Resolve the message below and run again.' : output}</p></div></li>
    </ol>
  </section>;
}
