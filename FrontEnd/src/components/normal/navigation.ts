// The Normal theme's sidebar, built from the catalogue (config/catalog.ts) as LAS groups its pages
// (Dashboard · <each folder> · Administration). Only openable pages are listed: a folder is a group, never an item.
import { hrefOf, visiblePages, type CatalogNode, type CatalogPage, type IconName } from '@/config/catalog';
import { iconNameOf } from '@/components/ui/icons';

export interface NormalNavItem { id: string; label: string; icon: IconName; href: string; description: string }
export interface NormalNavGroup { label: string; items: NormalNavItem[] }

/** The openable pages under a node (itself when it has no children), each with its path of ids. */
function leaves(node: CatalogNode, parents: string[], gallery: boolean): { node: CatalogNode; ids: string[] }[] {
  const ids = [...parents, node.id];
  if (!node.children) return [{ node, ids }];
  return node.children.filter(c => gallery || !c.devOnly).flatMap(c => leaves(c, ids, gallery));
}

const itemOf = ({ node, ids }: { node: CatalogNode; ids: string[] }): NormalNavItem => ({
  id: ids.join('/'), label: node.title, icon: iconNameOf(node), href: node.type === 'overview' ? '/' : hrefOf(ids), description: node.description
});

/**
 * The sidebar groups: the overview as Dashboard, each folder with its applications (nested folders flattened into it),
 * Settings as Administration. Developer-only pages and applications show only while the UI Gallery is enabled.
 */
export function normalNavigation(pages: CatalogPage[], gallery = true): NormalNavGroup[] {
  return visiblePages(gallery, pages).map(page => ({
    label: page.type === 'overview' ? 'Dashboard' : page.id === 'settings' ? 'Administration' : page.title,
    items: leaves(page, [], gallery).map(itemOf)
  })).filter(g => g.items.length > 0);
}

/** Where a folder route goes in the Normal theme: its first openable page, or null when it has none. */
export function firstApplicationHref(trail: CatalogNode[], gallery = true): string | null {
  const current = trail.at(-1);
  if (!current) return null;
  const first = leaves(current, trail.slice(0, -1).map(n => n.id), gallery)[0];
  return first && first.node !== current ? hrefOf(first.ids) : null;
}
