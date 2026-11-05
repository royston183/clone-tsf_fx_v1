// `react-router-dom` for the ported screens, over the template's navigation (lib/client/nav.tsx). Reference addresses
// (`/apps/<id>?x=1`, `/`, `/reporting`) are translated to the TSF_FX catalogue path of that screen (ref/routes.ts).
import { useCallback, useEffect, useMemo, type AnchorHTMLAttributes, type ReactNode } from 'react'
import { Link as NavLinkBase, usePathname, useRouter, useSearchParams as useUrlSearchParams } from '@/lib/client/nav'
import { translateRefPath } from '../routes.ts'

export type To = string | { pathname?: string; search?: string; hash?: string }
export type NavigateOptions = { replace?: boolean; state?: unknown }

const hrefOf = (to: To): string => {
  if (typeof to === 'string') return translateRefPath(to)
  const { pathname = '', search = '', hash = '' } = to
  return translateRefPath(`${pathname}${search && !search.startsWith('?') ? `?${search}` : search}${hash}`)
}

/** `navigate('/apps/dttk?display=1')`, `navigate(-1)`, `navigate(to, { replace: true })`. */
export function useNavigate(): (to: To | number, options?: NavigateOptions) => void {
  const router = useRouter()
  return useCallback((to, options) => {
    if (typeof to === 'number') {
      if (to === -1) router.back()
      else history.go(to)
      return
    }
    if (options?.replace) router.replace(hrefOf(to))
    else router.push(hrefOf(to))
  }, [router])
}

export type URLSearchParamsInit = string | string[][] | Record<string, string> | URLSearchParams
type SetSearchParams = (next: URLSearchParamsInit | ((prev: URLSearchParams) => URLSearchParamsInit), options?: NavigateOptions) => void

/** `[params, setParams]` as in react-router; the setter replaces the query string of the current page. */
export function useSearchParams(): [URLSearchParams, SetSearchParams] {
  const params = useUrlSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const set = useCallback<SetSearchParams>((next, options) => {
    const value = new URLSearchParams(typeof next === 'function' ? next(new URLSearchParams(location.search)) : next).toString()
    const href = `${pathname}${value ? `?${value}` : ''}`
    if (options?.replace) router.replace(href)
    else router.push(href)
  }, [pathname, router])
  return [params, set]
}

export type Location = { pathname: string; search: string; hash: string; state: null; key: string }

export function useLocation(): Location {
  const pathname = usePathname()
  const params = useUrlSearchParams()
  const search = params.toString()
  return useMemo(() => ({ pathname, search: search ? `?${search}` : '', hash: '', state: null, key: 'default' }), [pathname, search])
}

/** The reference screens read no route parameters (the screen is chosen by the catalogue). */
export function useParams(): Record<string, string | undefined> {
  return {}
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { to: To; replace?: boolean; state?: unknown }

export function Link({ to, replace, state, ...rest }: LinkProps) {
  void replace; void state
  return <NavLinkBase href={hrefOf(to)} {...rest} />
}

type NavLinkProps = Omit<LinkProps, 'className' | 'style' | 'children'> & {
  end?: boolean
  className?: string | ((state: { isActive: boolean }) => string | undefined)
  style?: React.CSSProperties | ((state: { isActive: boolean }) => React.CSSProperties | undefined)
  children?: ReactNode | ((state: { isActive: boolean }) => ReactNode)
}

export function NavLink({ to, end, className, style, children, ...rest }: NavLinkProps) {
  const pathname = usePathname()
  const target = hrefOf(to).split(/[?#]/)[0] ?? ''
  const isActive = end ? pathname === target : pathname === target || pathname.startsWith(`${target}/`)
  const state = { isActive }
  return (
    <Link to={to} {...rest} className={typeof className === 'function' ? className(state) : className} style={typeof style === 'function' ? style(state) : style}>
      {typeof children === 'function' ? children(state) : children}
    </Link>
  )
}

export function Navigate({ to, replace }: { to: To; replace?: boolean }) {
  const router = useRouter()
  const href = hrefOf(to)
  useEffect(() => {
    if (replace) router.replace(href)
    else router.push(href)
  }, [router, href, replace])
  return null
}

/** Not needed by the ported screens (the template owns routing); present so a stray import still resolves. */
export function BrowserRouter({ children }: { children: ReactNode }) {
  return <>{children}</>
}
