// The Normal navbar (LAS layout/Navbar.jsx): the white bar across the top with the brand, where you are, the SAP
// status, refresh, day/night, notifications and the signed-in user with sign-out.
import { useState } from 'react';
import { LayoutGrid, LogOut, Menu, Moon, RefreshCw, Sun } from 'lucide-react';
import { APP } from '@/config/app.config';
import type { CatalogNode, CatalogPage } from '@/config/catalog';
import { Link } from '@/lib/client/nav';
import { useTheme } from '@/lib/client/theme';
import { useWorkspace } from '@/components/shell/WorkspaceProvider';
import { NormalConnection } from './NormalConnection';
import { NotificationBell } from './NotificationBell';

export function NormalNavbar({ page, trail, navOpen, onToggleNav }: { page: CatalogPage; trail: CatalogNode[]; navOpen: boolean; onToggleNav: () => void }) {
  const { workspace, reload, signOut, signingOut } = useWorkspace();
  const [theme, setTheme] = useTheme();
  // The refresh icon turns while this button's own reload runs.
  const [refreshing, setRefreshing] = useState(false);
  const refresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    void reload().finally(() => setRefreshing(false));
  };
  const user = workspace.session?.username ?? '';
  const sapUser = workspace.session?.sapUsername;
  return (
    <header className="nt-topbar">
      <button className="nt-icon-button nt-mobile-menu" aria-label="Toggle navigation" title="Show or hide the menu" aria-controls="workspace-navigation" aria-expanded={navOpen} onClick={onToggleNav}>
        <Menu size={20} />
      </button>
      <Link className="nt-brand" href="/" aria-label={`${APP.name} home`}>
        <span className="nt-brand-mark"><img src={APP.logo} alt="" /></span>
        <div><strong>{APP.name}</strong><small>{APP.subtitle}</small></div>
      </Link>
      <div className="nt-topbar-tools">
        <div className="nt-topbar-context">
          <span className="nt-topbar-company" title={trail.map(n => n.title).join(' › ')}><LayoutGrid size={15} aria-hidden="true" />{page.short}</span>
          <NormalConnection />
        </div>
        <i className="nt-topbar-divider" />
        <button className="nt-icon-button" aria-label="Refresh workspace" title="Reload the latest workspace data" aria-busy={refreshing || undefined} onClick={refresh}>
          <RefreshCw size={17} className={refreshing ? 'nt-spin' : undefined} />
        </button>
        <button className="nt-icon-button nt-theme-toggle" aria-pressed={theme === 'dark'} aria-label={theme === 'light' ? 'Night' : 'Day'} title={theme === 'light' ? 'Switch to night mode' : 'Switch to day mode'} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
          {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
        </button>
        <NotificationBell />
        <div className="nt-topbar-user">
          <span className="nt-avatar" aria-hidden="true">{(user || APP.name).charAt(0).toUpperCase()}</span>
          <div><b>{user ? user.charAt(0).toUpperCase() + user.slice(1) : 'Signed in'}</b><small>{sapUser ? `SAP · ${sapUser}` : APP.workspaceLabel}</small></div>
          <button className="nt-icon-button" aria-label="Sign out" title="Sign out" disabled={signingOut} onClick={() => void signOut()}><LogOut size={17} /></button>
        </div>
      </div>
    </header>
  );
}
