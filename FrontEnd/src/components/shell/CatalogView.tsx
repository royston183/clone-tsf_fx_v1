import { useEffect, useState } from 'react';
import { useRouter } from '@/lib/client/nav';
import { ArrowLeft, Search } from 'lucide-react';
import { APP } from '@/config/app.config';
import { hrefOf, resolveTrail } from '@/config/catalog';
import { SettingsNote } from '@/components/settings/SettingsNote';
import { SettingsView } from '@/components/settings/SettingsView';
import { TileSections } from '@/components/ui/TileSections';
import { firstApplicationHref } from '@/components/normal/navigation';
import { APP_THEME } from '@/runtime';
import { ModuleView } from './ModuleView';
import { CustomPageView } from './CustomPageView';
import { Overview } from './Overview';
import { NormalOverview } from '@/components/normal/NormalOverview';
import { useWorkspace } from './WorkspaceProvider';

/**
 * Tiles by default; a registered custom page can replace any catalogue node's content. The Normal theme has no tiles:
 * a folder opens its first application, and NormalShell draws the page heading.
 */
export function CatalogView({ path }: { path: string[] }) {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { page, trail, current, invalid } = resolveTrail(path, workspace.gallery);
  const [query, setQuery] = useState('');
  const go = (ids: string[]) => router.push(hrefOf(ids));
  const normal = APP_THEME === 'normal';
  const redirect = normal && !invalid && !current.page && current.children ? firstApplicationHref(trail, workspace.gallery) : null;
  useEffect(() => { if (redirect) router.replace(redirect); }, [redirect, router]);
  if (redirect) return null;
  if (invalid) {
    // The Normal shell's page header already says "Page not found"; only the way back is shown under it.
    return <section className="panel empty">{!normal && <h1>Page not found</h1>}<button className="button" onClick={() => go([page.id])}>Return to {page.title}</button></section>;
  }
  const searchable = !current.page && (Boolean(current.children) || current.type === 'overview');
  const eyebrow = current.type === 'application' ? 'APPLICATION WORKSPACE' : page.id === 'settings' ? 'WORKSPACE PREFERENCES' : APP.name.toUpperCase();
  return (
    <>
      {!normal && (!current.page || current.heading !== 'custom') && <div className="page-heading">
        <div><span className="eyebrow">{eyebrow}</span><h1>{current.title}</h1><p>{current.description}</p></div>
        {searchable && (
          <label className="search"><Search size={17} />
            <input aria-label="Search applications and folders" placeholder="Find an application or folder…" value={query} onChange={e => setQuery(e.target.value)} />
            {query && <button aria-label="Clear search" onClick={() => setQuery('')}>×</button>}
          </label>
        )}
        {trail.length > 1
          ? <button className="button secondary" onClick={() => go(trail.slice(0, -1).map(n => n.id))}><ArrowLeft size={16} />Back</button>
          : <span className="page-code">{page.code}</span>}
      </div>}
      {current.page ? <CustomPageView node={current} trail={trail} />
        : current.type === 'overview' ? (normal ? <NormalOverview query={query} /> : <Overview query={query} />)
        : current.children && normal ? <section className="panel empty"><h2>Nothing to open here yet</h2><p>{current.title} has no applications.</p></section>
        : current.children ? <>
          <TileSections nodes={current.children} query={query} label={current.type === 'folder' ? 'FOLDER CONTENTS' : 'APPLICATIONS & FOLDERS'} hrefFor={n => hrefOf([...trail.map(x => x.id), n.id])} />
          {page.id === 'settings' && <SettingsNote />}
        </>
        : current.type === 'settings' ? <SettingsView node={current} />
        : <ModuleView node={current} />}
    </>
  );
}
