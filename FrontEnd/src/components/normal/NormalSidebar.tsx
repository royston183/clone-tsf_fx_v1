// The Normal sidebar (LAS layout/Sidebar.jsx): the catalogue's pages in groups under the navbar. On a desktop it is a
// 64 px icon rail that opens while pointed at or reached by keyboard (shell.css); at 750 px and below it slides in
// behind the navbar's menu button, over a backdrop that closes it.
import { createElement, Fragment } from 'react';
import { pages } from '@/config/catalog';
import { ICONS } from '@/components/ui/icons';
import { useWorkspace } from '@/components/shell/WorkspaceProvider';
import { normalNavigation } from './navigation';

export function NormalSidebar({ activeId, open, onNavigate, onClose }: { activeId: string; open: boolean; onNavigate: (href: string) => void; onClose: () => void }) {
  const { workspace } = useWorkspace();
  return (
    <>
      {open && <button className="nt-sidebar-backdrop" aria-label="Close navigation" onClick={onClose} />}
      <aside id="workspace-navigation" className={`nt-sidebar${open ? ' open' : ''}`}>
        <nav aria-label="Workspace">
          {normalNavigation(pages, workspace.gallery).map((group, g) => (
            <Fragment key={g}>
              <span className="nt-nav-group"><span>{group.label}</span></span>
              {group.items.map(item => {
                const active = item.id === activeId;
                return (
                  <button key={item.id} data-href={item.href} title={item.description} className={active ? 'nt-active' : undefined} aria-current={active ? 'page' : undefined} onClick={() => onNavigate(item.href)}>
                    <i className="nt-nav-icon">{createElement(ICONS[item.icon], { size: 16, 'aria-hidden': true })}</i>
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </Fragment>
          ))}
        </nav>
      </aside>
    </>
  );
}
