import { Link } from '@/lib/client/nav';
import { ArrowUpRight } from 'lucide-react';
import { APP } from '@/config/app.config';
import { visiblePages } from '@/config/catalog';
import { NodeIcon } from '@/components/ui/icons';
import { useWorkspace } from './WorkspaceProvider';

/** ALM's left rail: 64 px, expands to 288 px on hover or keyboard focus; on phones it opens as an overlay. */
export function Sidebar({ activeId, open, onNavigate }: { activeId: string; open: boolean; onNavigate: () => void }) {
  const { workspace } = useWorkspace();
  const session = workspace.session;
  const connected = session?.sapStatus === 'connected';
  return (
    <aside id="workspace-navigation" className={`sidebar ${open ? 'mobile-open' : ''}`}>
      <Link className="brand" href="/" aria-label={`${APP.name} home`} onClick={onNavigate}>
        <img src={APP.logo} alt="" /><span><strong>{APP.name}</strong><small>{APP.subtitle}</small></span>
      </Link>
      <div className="nav-label">WORKSPACE</div>
      <nav aria-label="Main navigation">
        {visiblePages(workspace.gallery).map(p => {
          const active = p.id === activeId;
          return (
            <Link key={p.id} href={p.id === 'overview' ? '/' : `/${p.id}`} title={p.title} onClick={onNavigate} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}>
              <NodeIcon node={p} size={20} /><span>{p.title}</span>{active && <i />}
            </Link>
          );
        })}
      </nav>
      <div className="sidebar-bottom">
        <div className="workspace-card"><span className="mini-mark">{APP.name.charAt(0)}</span><div><b>{APP.workspaceLabel}</b><small>{APP.workspaceNote}</small></div></div>
        <Link className="connection-link" href="/settings/sap-connection" onClick={onNavigate}>
          <span className={`status-dot ${connected ? 'online' : ''}`} />
          <span>{!session?.sapUsername ? 'SAP not connected' : `SAP · ${session.sapUsername}`}</span>
          <ArrowUpRight size={14} />
        </Link>
      </div>
    </aside>
  );
}
