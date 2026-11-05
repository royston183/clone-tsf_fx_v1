// Reference application id -> the TSF_FX catalogue path of that screen, built from config/catalog.ts (a node's id is the
// reference app id, except `deal-id-details`, which the reference calls `fo-deal-id-details`).
import { applications, pages } from '@/config/catalog';

/** Catalogue node ids that carry another id in the reference's config/apps.json. */
const REFERENCE_ID: Record<string, string> = { 'deal-id-details': 'fo-deal-id-details' };

export const REF_ROUTES: Record<string, string> = Object.fromEntries(
  applications.flatMap(a => {
    const node = a.id;
    const ref = REFERENCE_ID[node];
    return ref ? [[node, a.href], [ref, a.href]] : [[node, a.href]];
  })
);

/** The reference hub (`/`) and its report menus. */
export const REF_HOME = '/fx-structure';

/**
 * A reference address (`/apps/<id>?x=1`, `/`, `/reporting/fx-structure`, ...) as a TSF_FX address. A reference route
 * that has no screen here goes to the FX Structure page; an address that is not a reference one is returned unchanged.
 */
export function translateRefPath(to: string): string {
  const url = /^(\/[^?#]*)(\?[^#]*)?(#.*)?$/.exec(to);
  if (!url) return to;
  const [, path = '/', search = '', hash = ''] = url;
  const app = /^\/apps\/([^/]+)\/?$/.exec(path);
  if (app) return `${REF_ROUTES[decodeURIComponent(app[1] ?? '')] ?? REF_HOME}${search}${hash}`;
  if (path === '/' || path === '/overview') return REF_HOME;
  // The reference's report menus (/reporting, /reporting/fx-structure) are the one Reporting page here.
  if (path === '/reporting' || path === '/reporting/fx-structure') return '/reporting';
  const first = path.split('/')[1] ?? '';
  if (pages.some(p => p.id === first)) return to;
  return REF_HOME;
}
