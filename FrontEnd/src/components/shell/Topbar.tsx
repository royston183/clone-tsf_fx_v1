import { Fragment } from 'react';
import { useRouter } from '@/lib/client/nav';
import { LogOut, Menu, Moon, RefreshCw, Sun } from 'lucide-react';
import { APP } from '@/config/app.config';
import { hrefOf, type CatalogNode, type CatalogPage } from '@/config/catalog';
import { useTheme } from '@/lib/client/theme';
import { connectionChip } from '@/lib/workspace-status';
import { useWorkspace } from './WorkspaceProvider';

export function Topbar({ page, trail, navOpen, onToggleNav, slotRef }: { page: CatalogPage; trail: CatalogNode[]; navOpen: boolean; onToggleNav: () => void; slotRef?: (el: HTMLDivElement | null) => void }) {
  const router = useRouter();
  const { workspace, signOut, signingOut } = useWorkspace();
  const [theme, setTheme] = useTheme();
  const s = workspace.session;
  const { label, tone } = connectionChip(workspace);
  return (
    <header className="topbar">
      <button className="icon-button menu-toggle" onClick={onToggleNav} aria-label="Toggle navigation" aria-expanded={navOpen} aria-controls="workspace-navigation"><Menu size={20} /></button>
      <nav className="top-crumb" aria-label="Breadcrumb">
        <span>{APP.crumbRoot}</span>
        {trail.map((node, i) => (
          <Fragment key={node.id}>
            <span className="crumb-sep" aria-hidden="true">/</span>
            <button aria-current={i === trail.length - 1 ? 'page' : undefined} onClick={() => router.push(hrefOf(trail.slice(0, i + 1).map(n => n.id)))}>{i === 0 ? page.short : node.title}</button>
          </Fragment>
        ))}
      </nav>
      <div className="top-actions">
        {/* The open page's own controls (As of date, units, its action): TopbarActions. */}
        <div className="top-page-actions" ref={slotRef} />
        <button className={`connection-chip kit-status ${tone}`} title={`${label}: open Settings → SAP Connection`} onClick={() => router.push('/settings/sap-connection')}><span className="kit-status-dot" aria-hidden="true" />{label}</button>
        <button className="button secondary small theme-toggle top-icon" aria-label={theme === 'light' ? 'Night' : 'Day'} aria-pressed={theme === 'dark'} title={theme === 'light' ? 'Switch to night mode' : 'Switch to day mode'} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
          {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
        </button>
        <button className="button secondary small top-icon" aria-label="Refresh page" title="Read the page's data again" onClick={() => router.refresh()}><RefreshCw size={16} /></button>
        <span className="avatar" title={s?.username}>{(s?.username ?? 'SA').slice(0, 2).toUpperCase()}</span>
        <button className="icon-button" onClick={() => void signOut()} disabled={signingOut} aria-label="Sign out" title="Sign out"><LogOut size={16} /></button>
      </div>
    </header>
  );
}
