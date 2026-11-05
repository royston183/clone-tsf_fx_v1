// The Normal theme's frame (LAS layout/AppShell.jsx), the counterpart of WorkspaceShell: the navbar across the top,
// the sidebar rail under it, then the page on the canvas with its header, the workspace notices and the footer.
import { useState, type ReactNode } from 'react';
import { APP } from '@/config/app.config';
import { resolveTrail, type CatalogNode } from '@/config/catalog';
import { usePathname, useRouter } from '@/lib/client/nav';
import { TransactionProvider } from '@/components/trm/TransactionProvider';
import { WorkspaceNotices } from '@/components/shell/WorkspaceNotices';
import { useWorkspace } from '@/components/shell/WorkspaceProvider';
import type { IllustrationName } from './Illustration';
import { NormalNavbar } from './NormalNavbar';
import { NormalSidebar } from './NormalSidebar';
import { PageHeader } from './PageHeader';

export function NormalShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { page, trail, current, invalid } = resolveTrail(pathname.split('/').filter(Boolean).map(decodeURIComponent), workspace.gallery);
  // The mobile menu belongs to the page it was opened on, so any navigation closes it without an effect.
  const [navOpenAt, setNavOpenAt] = useState<string | null>(null);
  const navOpen = navOpenAt === pathname;
  // /gallery is a developer page outside the catalogue; a custom page may draw its own heading.
  const heading: { trail: CatalogNode[]; title: string; description?: string; illustration: IllustrationName } | null =
    pathname === '/gallery' ? { trail: [{ ...current, id: 'gallery', title: 'UI Gallery' }], title: 'UI Gallery', description: 'Every component of the template, by its ID.', illustration: 'analytics' }
      : invalid ? { trail: [], title: 'Page not found', illustration: 'search' }
        : current.page && current.heading === 'custom' ? null
          : { trail, title: current.title, description: current.description, illustration: current.illustration ?? 'analytics' };
  // The navbar and sidebar say where you are: a path that is no catalogue page highlights nothing.
  const navPage = pathname === '/gallery' && workspace.gallery ? { ...page, short: 'UI Gallery' } : invalid ? { ...page, short: 'Page not found' } : page;
  const navigate = (href: string) => { setNavOpenAt(null); router.push(href); };
  return (
    <TransactionProvider>
      <div className="nt-app nt-nav-collapsed">
        <NormalNavbar page={navPage} trail={invalid ? [] : trail} navOpen={navOpen} onToggleNav={() => setNavOpenAt(navOpen ? null : pathname)} />
        <div className="nt-app-body">
          <NormalSidebar activeId={invalid ? '' : trail.map(n => n.id).join('/')} open={navOpen} onNavigate={navigate} onClose={() => setNavOpenAt(null)} />
          <div className="nt-main">
            <main className="nt-content">
              <div className="nt-surface-arches" aria-hidden="true" />
              {heading && <PageHeader {...heading} />}
              <WorkspaceNotices />
              {children}
              <footer className="nt-page-footer"><span>{APP.name} · {APP.subtitle}</span><span>{APP.footerVersion}</span></footer>
            </main>
          </div>
        </div>
      </div>
    </TransactionProvider>
  );
}
