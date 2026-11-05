import { Link } from '@/lib/client/nav';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import type { CatalogNode } from '@/config/catalog';
import { NodeIcon } from './icons';

export function Tile({ node, href }: { node: CatalogNode; href: string }) {
  const count = node.children?.length ?? 0;
  return (
    <Link className={`tile ${node.type}`} href={href}>
      <span className="tile-top"><span className="tile-icon"><NodeIcon node={node} size={21} /></span></span>
      <span className="tile-title"><span className="tile-clamp">{node.title}</span></span>
      <span className="tile-desc"><span className="tile-clamp">{node.description}</span></span>
      <span className="tile-foot">{node.type === 'folder' && <span className="tile-tag">{count} {count === 1 ? 'item' : 'items'}</span>}{node.type === 'folder' ? <ArrowRight size={16} /> : <ArrowUpRight size={16} />}</span>
    </Link>
  );
}
