// Client-side navigation for the static FrontEnd: the browser history, with the hooks the screens use
// (usePathname, useSearchParams, useRouter) and a <Link>. NavProvider (src/App.tsx) holds the current location.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from 'react';

export interface Router {
  push: (href: string) => void;
  replace: (href: string) => void;
  /** Reloads what the page shows from the API (the workspace and its session). */
  refresh: () => void;
  back: () => void;
}
interface NavValue { pathname: string; search: string; version: number; router: Router }

const NavContext = createContext<NavValue | null>(null);

const here = () => ({ pathname: location.pathname, search: location.search });

/** Fired after every history.pushState / replaceState, also the screens' own calls (as Next.js followed them). */
const NAVIGATED = 'app:navigated';
function followHistory(): void {
  const h = history as History & { __followed?: boolean };
  if (h.__followed) return;
  h.__followed = true;
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = h[method].bind(h);
    h[method] = (...args: Parameters<History['pushState']>) => { original(...args); dispatchEvent(new Event(NAVIGATED)); };
  }
}
// Before any screen mounts, so a replaceState in a first effect is seen too.
if (typeof history !== 'undefined') followHistory();

export function NavProvider({ children }: { children: ReactNode }) {
  const [where, setWhere] = useState(here);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const sync = () => setWhere(here());
    addEventListener('popstate', sync);
    addEventListener(NAVIGATED, sync);
    return () => { removeEventListener('popstate', sync); removeEventListener(NAVIGATED, sync); };
  }, []);
  const go = useCallback((href: string, replace: boolean) => {
    const url = new URL(href, location.href);
    if (url.origin !== location.origin) { location.assign(url.href); return; }
    history[replace ? 'replaceState' : 'pushState'](null, '', url.pathname + url.search + url.hash);
    if (!url.hash) scrollTo(0, 0);
  }, []);
  const router = useMemo<Router>(() => ({
    push: href => go(href, false),
    replace: href => go(href, true),
    refresh: () => setVersion(v => v + 1),
    back: () => history.back()
  }), [go]);
  const value = useMemo(() => ({ ...where, version, router }), [where, version, router]);
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

function useNav(): NavValue {
  const value = useContext(NavContext);
  if (!value) throw new Error('Navigation hooks must be used inside NavProvider.');
  return value;
}

export const usePathname = (): string => useNav().pathname;
export function useSearchParams(): URLSearchParams {
  const { search } = useNav();
  return useMemo(() => new URLSearchParams(search), [search]);
}
export const useRouter = (): Router => useNav().router;
/** Changes after every refresh(): what a page loads from the API is keyed by it. */
export const useNavVersion = (): number => useNav().version;

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { href: string };

/** An <a> that navigates in the page (a modified click or another target opens the browser's way). */
export function Link({ href, onClick, target, ...rest }: LinkProps) {
  const { router } = useNav();
  const click = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (target && target !== '_self')) return;
    e.preventDefault();
    router.push(href);
  };
  return <a href={href} target={target} onClick={click} {...rest} />;
}
