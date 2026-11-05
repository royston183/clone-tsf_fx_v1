// The Normal theme's Overview: application search results while searching, else the dashboard when the catalogue's
// home has one, else "Overview not built yet". No tiles. NormalShell draws the page heading.
import { lazy, Suspense } from 'react';
import { Link } from '@/lib/client/nav';
import { applications, pages } from '@/config/catalog';
import { MODULES } from '@/modules/registry';
import { Loading } from '@/components/ui/Loading';
import { iconOf } from '@/components/ui/icons';
import { useWorkspace } from '@/components/shell/WorkspaceProvider';
import { OverviewPending } from '@/components/shell/OverviewPending';

const DashboardView = lazy(() => import('@/components/dashboard/DashboardView'));

export function NormalOverview({ query }: { query: string }) {
  const { workspace } = useWorkspace();
  const home = pages.find(p => p.type === 'overview');
  const dashboard = home?.module ? MODULES[home.module] : undefined;
  if (!query) {
    if (dashboard?.kind === 'dashboard') {
      return <Suspense fallback={<Loading text="Loading dashboard…" />}><DashboardView def={dashboard} system={workspace.usesSap ? `${workspace.systemId} / ${workspace.client}` : ''} /></Suspense>;
    }
    return <OverviewPending />;
  }
  const q = query.toLowerCase();
  const shown = applications.filter(a => `${a.title} ${a.description}`.toLowerCase().includes(q));
  return (
    <>
      <section className="nt-overview-apps" aria-label="Applications">
        <h2>Applications</h2>
        {shown.length === 0 && <p className="nt-overview-empty">No application matches.</p>}
        <ul>{shown.map(a => {
          const Icon = iconOf(a);
          return <li key={a.href}><Link className="nt-app-link" href={a.href}><i className="nt-tone-icon nt-icon-blue"><Icon size={18} aria-hidden="true" /></i><span><strong>{a.title}</strong><small>{a.description}</small></span></Link></li>;
        })}</ul>
      </section>
    </>
  );
}
