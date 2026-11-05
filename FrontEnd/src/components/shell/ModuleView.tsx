import { lazy, Suspense, type ReactNode } from 'react';
import type { CatalogNode } from '@/config/catalog';
import { isTableModule, MODULES } from '@/modules/registry';
import { NodeIcon } from '@/components/ui/icons';

// Each kind of screen is its own chunk, loaded when an application of that kind is opened.
const Workbench = lazy(() => import('@/components/workbench/Workbench'));
const ObjectWorkbench = lazy(() => import('@/components/object/ObjectWorkbench'));
const ItemsWorkbench = lazy(() => import('@/components/items/ItemsWorkbench'));
const UploadWorkbench = lazy(() => import('@/components/upload/UploadWorkbench'));
const ReportWorkbench = lazy(() => import('@/components/report/ReportWorkbench'));
const DashboardView = lazy(() => import('@/components/dashboard/DashboardView'));
const loading = <section className="panel"><div className="empty">Loading application…</div></section>;
const load = (screen: ReactNode) => <Suspense fallback={loading}>{screen}</Suspense>;

export function ModuleView({ node }: { node: CatalogNode }) {
  const def = node.module && Object.hasOwn(MODULES, node.module) ? MODULES[node.module] : undefined;
  if (def && isTableModule(def)) return load(<Workbench def={def} />);
  if (def?.kind === 'object') return load(<ObjectWorkbench def={def} />);
  if (def?.kind === 'items') return load(<ItemsWorkbench def={def} />);
  if (def?.kind === 'upload') return load(<UploadWorkbench def={def} />);
  if (def?.kind === 'report') return load(<ReportWorkbench def={def} />);
  if (def?.kind === 'dashboard') return load(<DashboardView def={def} />);
  return (
    <section className="panel"><div className="empty">
      <span className="empty-icon"><NodeIcon node={node} size={30} /></span>
      <h2>This application is not available yet</h2>
      <p>No module is registered for “{node.title}”. Register it in src/modules/registry.ts.</p>
    </div></section>
  );
}
