// src/lib/drill/target.ts
// Where a drill target goes: the screen of a module (its filters as f.*, or one record as ?open=) or a custom page
// (its params as the query), always with the page to come back to. A target the catalogue does not know is no link. Pure.
import { hrefOfModule, hrefOfPage, pages, type CatalogNode } from '@/config/catalog';
import type { DrillTarget, LinkTarget } from '@/lib/report/types';
import { drillHref, openHref, safeFrom } from './params';

/** The URL a target opens, or null for a target that is not a link or that the catalogue does not know. */
export function targetHref(t: DrillTarget | undefined, from: string | null, extra: Record<string, string> = {}, nodes: CatalogNode[] = pages): string | null {
  if (t?.kind === 'screen') {
    const path = hrefOfModule(t.module, nodes);
    if (!path) return null;
    return t.open ? openHref(path, t.open, from) : drillHref(path, t.filters, from, extra);
  }
  if (t?.kind === 'page') {
    const path = hrefOfPage(t.page, nodes);
    if (!path) return null;
    const p = new URLSearchParams(t.params ?? {});
    const back = safeFrom(from);
    if (back) p.set('from', back);
    const q = p.toString();
    return q ? `${path}?${q}` : path;
  }
  return null;
}

/** A screen or page target whose address resolves. */
export const isLinkTarget = (t?: DrillTarget, nodes: CatalogNode[] = pages): t is LinkTarget => targetHref(t, null, {}, nodes) !== null;

/** A report cell that does something when clicked: a breakdown, or a screen or page the catalogue knows. */
export const isClickable = (t: DrillTarget): boolean => t.kind === 'breakdown' || isLinkTarget(t);
