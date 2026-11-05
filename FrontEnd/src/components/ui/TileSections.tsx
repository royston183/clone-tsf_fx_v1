import { Folder, Search } from 'lucide-react';
import type { CatalogNode } from '@/config/catalog';
import { Tile } from './Tile';

/** Tiles grouped under a heading per section in catalogue order, filtered by the page search. */
export function TileSections<T extends CatalogNode>({ nodes, query, label, hrefFor }: { nodes: T[]; query: string; label: string; hrefFor: (node: T) => string }) {
  const q = query.toLowerCase();
  const filtered = nodes.filter(n => `${n.title} ${n.description}`.toLowerCase().includes(q));
  const sections = [...new Set(nodes.map(n => n.section ?? ''))];
  return (
    <>
      {sections.map(sec => {
        const shown = filtered.filter(n => (n.section ?? '') === sec);
        if (!shown.length) return null;
        return (
          <div key={sec || 'main'} className="tile-section">
            <div className="section-toolbar"><div className="section-label">{sec ? sec.toUpperCase() : label}<span>{nodes.filter(n => (n.section ?? '') === sec).length}</span></div></div>
            <div className="tile-grid">{shown.map(node => <Tile key={node.id} node={node} href={hrefFor(node)} />)}</div>
          </div>
        );
      })}
      {!filtered.length && (nodes.length
        ? <div className="empty"><Search size={24} /><h2>No matching applications or folders</h2><p>Try another search term.</p></div>
        : <div className="empty"><Folder size={24} /><h2>No applications yet</h2><p>This folder is ready for the applications that are still to come.</p></div>)}
    </>
  );
}
