import { useEffect, useState } from 'react';
import { Folder, Search } from 'lucide-react';
import type { CatalogNode } from '@/config/catalog';
import { loadTileMetric, TILE_METRICS } from '@/config/tile-metrics';
import { Tile } from './Tile';

/** Figures for the tiles that have one, read after the page renders; a failed or empty read leaves the tile plain. */
function useTileMetrics(nodes: CatalogNode[]): Record<string, string> {
  const [found, setFound] = useState<Record<string, string>>({});
  const ids = nodes.filter(n => n.type === 'application' && Object.hasOwn(TILE_METRICS, n.id)).map(n => n.id).join('|');
  useEffect(() => {
    let live = true;
    for (const id of ids ? ids.split('|') : []) void loadTileMetric(id).then(v => { if (live && v) setFound(f => ({ ...f, [id]: v })); });
    return () => { live = false; };
  }, [ids]);
  return found;
}

/** Tiles grouped under a heading per section in catalogue order, filtered by the page search. */
export function TileSections<T extends CatalogNode>({ nodes, query, label, hrefFor }: { nodes: T[]; query: string; label: string; hrefFor: (node: T) => string }) {
  const metrics = useTileMetrics(nodes);
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
            <div className="tile-grid">{shown.map(node => <Tile key={node.id} node={node} href={hrefFor(node)} metric={metrics[node.id]} />)}</div>
          </div>
        );
      })}
      {!filtered.length && (nodes.length
        ? <div className="empty"><Search size={24} /><h2>No matching applications or folders</h2><p>Try another search term.</p></div>
        : <div className="empty"><Folder size={24} /><h2>No applications yet</h2><p>This folder is ready for the applications that are still to come.</p></div>)}
    </>
  );
}
