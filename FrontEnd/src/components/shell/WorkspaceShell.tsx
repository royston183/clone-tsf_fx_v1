import { useState, type ReactNode } from 'react';
import { usePathname } from '@/lib/client/nav';
import { APP } from '@/config/app.config';
import { resolveTrail } from '@/config/catalog';
import { TransactionProvider } from '@/components/trm/TransactionProvider';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { TopbarSlotProvider } from './TopbarSlot';
import { WorkspaceNotices } from './WorkspaceNotices';

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { page, trail } = resolveTrail(pathname.split('/').filter(Boolean));
  // /gallery is a developer page outside the catalogue; label its breadcrumb without adding it to the rail.
  const crumbPage = pathname === '/gallery' ? { ...page, short: 'UI Gallery' } : page;
  // The mobile menu belongs to the page it was opened on, so any navigation closes it without an effect.
  const [navOpenAt, setNavOpenAt] = useState<string | null>(null);
  const navOpen = navOpenAt === pathname;
  // Where a page puts its own top-bar controls (TopbarActions).
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  return (
    <TopbarSlotProvider value={slot}>
    <TransactionProvider>
      <div className="app">
        <Sidebar activeId={page.id} open={navOpen} onNavigate={() => setNavOpenAt(null)} />
        <div className="main">
          <Topbar page={crumbPage} trail={trail} navOpen={navOpen} onToggleNav={() => setNavOpenAt(navOpen ? null : pathname)} slotRef={setSlot} />
          <main className="content">
            <WorkspaceNotices />
            {children}
          </main>
          <footer className="page-footer"><span>{APP.name} <i />{APP.subtitle}</span><span>{APP.footerVersion}</span></footer>
        </div>
      </div>
    </TransactionProvider>
    </TopbarSlotProvider>
  );
}
