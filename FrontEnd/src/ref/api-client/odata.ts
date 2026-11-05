import { apiRequest, apiFetch } from './http.ts'
import type { RequestOptions } from './http.ts'

/** An OData collection response. */
export type ODataCollection<T> = { value: T[]; '@odata.count'?: number }

export type ODataQuery = {
  filter?: string
  orderby?: string
  select?: string[]
  expand?: string
  top?: number
  skip?: number
  count?: boolean
  search?: string
}

/**
 * Builds the query string. URLSearchParams encodes values correctly and leaves the
 * reserved characters OData needs inside a $filter alone, so a filter is written as
 * plain readable text — `ZdttkNo eq '123'` — and encoded exactly once, here.
 * The legacy pages hand-encoded at every call site and disagreed about whether the
 * leading `$` was encoded too.
 */
export function odataQuery(query: ODataQuery = {}): string {
  const params = new URLSearchParams()
  if (query.filter) params.set('$filter', query.filter)
  if (query.orderby) params.set('$orderby', query.orderby)
  if (query.select?.length) params.set('$select', query.select.join(','))
  if (query.expand) params.set('$expand', query.expand)
  if (query.top !== undefined) params.set('$top', String(query.top))
  if (query.skip !== undefined) params.set('$skip', String(query.skip))
  if (query.count) params.set('$count', 'true')
  if (query.search) params.set('$search', query.search)
  return params.toString()
}

/** Escapes a value for use inside an OData string literal. A quote is doubled, not backslashed. */
export function odataString(value: string): string {
  return `'${String(value).replace(/'/g, "''")}'`
}

/**
 * Builds an entity path: a single key becomes ('100042'), a composite key becomes
 * (ZdttkNo='123',ZfeeType='ABC') — the two forms SAP's own services use.
 */
export function entityPath(entitySet: string, key: string | Record<string, string>): string {
  if (typeof key === 'string') return `${entitySet}(${odataString(key)})`
  const parts = Object.entries(key).map(([name, value]) => `${name}=${odataString(value)}`)
  return `${entitySet}(${parts.join(',')})`
}

export type ServicePath = (path: string) => string

/** Binds a service key so callers write `ottk('SlcOttkDetail')` instead of repeating '/api/ottk'. */
export function service(key: string): ServicePath {
  return (path: string) => `/api/${key}/${path.replace(/^\/+/, '')}`
}

export async function list<T>(url: string, query?: ODataQuery, options?: RequestOptions): Promise<T[]> {
  const qs = query ? odataQuery(query) : ''
  const data = await apiFetch<ODataCollection<T>>(qs ? `${url}?${qs}` : url, options)
  return data?.value ?? []
}

/**
 * Creates an entity and returns its server-generated key.
 *
 * SAP does not reliably return the key the same way every time, so it is read from three
 * places in order — the same three the OTTK and DTTK pages each worked out separately:
 *   1. the created entity in the response body
 *   2. the OData-EntityId or Location header, shaped .../SlcOttkDetail('100042')
 *   3. a highest-value re-read, for services that answer a create with no content at all
 *
 * `keyField` names the key property; `fallbackOrder` is the field to sort by for step 3.
 */
export async function createEntity<T extends Record<string, unknown>>(
  collectionUrl: string,
  payload: unknown,
  keyField: string,
  options: { fallbackOrder?: string } = {},
): Promise<{ key: string | undefined; entity: T | undefined }> {
  const response = await apiRequest<T>(collectionUrl, { method: 'POST', body: payload })

  const fromBody = response.data?.[keyField]
  if (fromBody !== undefined && fromBody !== null && fromBody !== '') {
    return { key: String(fromBody), entity: response.data }
  }

  const header = response.headers.get('OData-EntityId') ?? response.headers.get('Location') ?? ''
  const match = header.match(/\(['"]?([^'")]+)['"]?\)\s*$/)
  if (match?.[1]) return { key: decodeURIComponent(match[1]), entity: response.data }

  const orderField = options.fallbackOrder ?? keyField
  const latest = await list<T>(collectionUrl, { orderby: `${orderField} desc`, top: 1 })
  const row = latest[0]
  const fallback = row?.[keyField]
  return {
    key: fallback === undefined || fallback === null ? undefined : String(fallback),
    entity: row,
  }
}
