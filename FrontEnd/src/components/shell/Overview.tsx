import { lazy, Suspense } from 'react';
import { Link } from '@/lib/client/nav';
import { Palette, PlugZap } from 'lucide-react';
import { applications, pages } from '@/config/catalog';
import { MODULES } from '@/modules/registry';
import { Loading } from '@/components/ui/Loading';
import { TileSections } from '@/components/ui/TileSections';
import { OverviewPending } from './OverviewPending';
import { useWorkspace } from './WorkspaceProvider';

const DashboardView = lazy(() => import('@/components/dashboard/DashboardView'));

export function Overview({ query }: { query: string }) {
  const { workspace } = useWorkspace();
  const status = workspace.session?.sapStatus;
  const statusText = !workspace.usesSap ? 'Not used' : status === 'connected' ? 'Connected' : status === 'checking' ? 'Checking…' : status === 'unavailable' ? 'Unavailable' : workspace.session?.sapUsername ? 'Not tested' : 'No SAP account';
  const home = pages.find(p => p.type === 'overview');
  const dashboard = home?.module ? MODULES[home.module] : undefined;
  if (dashboard?.kind === 'dashboard' && !query) return <>
    <Suspense fallback={<Loading text="Loading dashboard…" />}><DashboardView def={dashboard} system={workspace.usesSap ? `${workspace.systemId} / ${workspace.client}` : ''} /></Suspense>
    <div className="kit-ov-footer"><Link href={workspace.usesSap ? '/settings/sap-connection' : '/settings/appearance'}><PlugZap size={14} />{workspace.usesSap ? `${statusText} · ${workspace.systemId} / ${workspace.client}` : 'Application settings'}</Link><Link href="?applications=1">All applications ↗</Link></div>
    {new URLSearchParams(window.location.search).has('applications') && <TileSections nodes={applications} query="" label="APPLICATIONS" hrefFor={n => n.href} />}
  </>;
  if (query) return <TileSections nodes={applications} query={query} label="APPLICATIONS" hrefFor={n => n.href} />;
  return (
    <>
      <OverviewPending />
      {workspace.gallery && (
        <p className="workspace-note"><Link href="/gallery"><Palette size={14} /> UI Gallery</Link> (developers only)</p>
      )}
    </>
  );
}
