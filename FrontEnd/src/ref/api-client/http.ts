// TSF_FX replacement for the reference's gateway client (packages/api-client/src/http.ts).
//
// The reference calls everything as `/api/<serviceKey>/<path>` through one gateway. TSF_FX has no gateway: the path is
// kept as the address of a service and dispatched here:
//   - SAP OData keys (fx, trmfxapp, ottk, ...)  -> the SAP relay, through the template's SAP layer (core/sap/client.ts:
//     Basic auth of this tab's SAP account, sap-client, CSRF token, ETag / If-Match)
//   - middleware, localdb                       -> the TSF_FX BackEnd (/api/ref/<key>/<path>), JSON as-is
//   - notifications                             -> answered in the browser (a cosmetic stub, nothing is sent)
import { sapRequest, type SapRequest } from '@core/sap/client'
import { sapServiceOf } from '@core/sap/config'
import { backendRequest } from '@/lib/client/backend-api'
import { buildConfig, sapConnection, sapSettings } from '@/lib/client/sap-account'
import { HttpError } from '@/lib/errors'
import { ApiError, extractMessage } from './errors.ts'

export type ConnectionState = 'connected' | 'unreachable' | 'unknown'
type ConnectionListener = (state: ConnectionState) => void

const listeners = new Set<ConnectionListener>()
let connection: ConnectionState = 'unknown'

/** Connection state is global: it describes the one SAP relay / BackEnd every ported screen shares. */
export function onConnectionChange(listener: ConnectionListener): () => void {
  listeners.add(listener)
  listener(connection)
  return () => listeners.delete(listener)
}

export function getConnectionState(): ConnectionState {
  return connection
}

function setConnection(next: ConnectionState): void {
  if (next === connection) return
  connection = next
  for (const listener of listeners) listener(next)
}

export type RequestOptions = {
  method?: string
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
}

export type ApiResponse<T> = {
  data: T
  status: number
  headers: Headers
}

/** Services the TSF_FX BackEnd answers (/api/ref/<key>/...). */
export const BACKEND_KEYS: ReadonlySet<string> = new Set(['middleware', 'localdb'])
/** Services answered in the browser with a harmless stub. */
export const STUB_KEYS: ReadonlySet<string> = new Set(['notifications'])
/** Reference service keys that are another key of config/services.json. */
export const SERVICE_ALIASES: Readonly<Record<string, string>> = { fx: 'trmfx' }

export type RefTarget = { key: string; path: string; query: string }

/** `/api/<key>/<path>?<query>` -> its parts. Throws ApiError(400) for any other address. */
export function parseRefPath(address: string): RefTarget {
  const match = /^\/api\/([^/?#]+)(?:\/([^?#]*))?(?:\?([^#]*))?/.exec(address)
  if (!match) throw new ApiError(`Not a service address: ${address}`, 400, null)
  return { key: match[1] ?? '', path: match[2] ?? '', query: match[3] ?? '' }
}

type Routed = { status: number; headers: Headers; text: string }

const lower = (headers: Record<string, string> | undefined): Record<string, string> =>
  Object.fromEntries(Object.entries(headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]))

function bodyText(body: unknown): string | undefined {
  if (body === undefined) return undefined
  if (typeof body === 'string') return body
  if (typeof FormData !== 'undefined' && body instanceof FormData) throw new ApiError('Multipart bodies are not supported through the SAP relay.', 400, null)
  return JSON.stringify(body)
}

function aborted(signal: AbortSignal | undefined): Promise<never> | null {
  if (!signal) return null
  const error = () => new DOMException('The operation was aborted.', 'AbortError')
  if (signal.aborted) return Promise.reject(error())
  return new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(error()), { once: true }))
}

async function viaSap(target: RefTarget, method: string, options: RequestOptions): Promise<Routed> {
  let service
  try {
    service = sapServiceOf(buildConfig(), SERVICE_ALIASES[target.key] ?? target.key)
  } catch (error) {
    if (error instanceof HttpError) throw new ApiError(error.message, error.status, null)
    throw error
  }
  const conn = sapConnection()
  if (!conn) throw new ApiError('No SAP account is set. Enter the SAP user and password in Settings → SAP Connection.', 401, null)
  const headers = lower(options.headers)
  const req: SapRequest = { path: target.path, query: target.query, method: method as SapRequest['method'] }
  const body = bodyText(options.body)
  if (body !== undefined) req.body = body
  if (headers['if-match']) req.etag = headers['if-match']
  if (headers['content-type']) req.contentType = headers['content-type']
  if (headers['accept']) req.accept = headers['accept']
  if (headers['prefer']) req.prefer = headers['prefer']
  const call = sapRequest(sapSettings(), conn, service, req)
  const cancelled = aborted(options.signal)
  const result = await (cancelled ? Promise.race([call, cancelled]) : call).catch((error: unknown) => {
    if (error instanceof HttpError) {
      if (error.status === 502 && /Cannot reach/i.test(error.message)) setConnection('unreachable')
      throw new ApiError(error.message, error.status, null)
    }
    throw error
  })
  return { status: result.status, headers: result.headers, text: result.text }
}

/**
 * The ref routes of the BackEnd answer in the reference gateway's shape (errors are `{error:{message:{value}}}`), so the
 * body, status and headers go back unchanged: this calls fetch the way lib/client/backend-api.ts does (base URL,
 * `x-app-user`, `x-app-request`, no cookies) instead of going through its HttpError.
 */
async function viaBackend(target: RefTarget, method: string, options: RequestOptions): Promise<Routed> {
  const address = `/ref/${target.key}/${target.path}${target.query ? `?${target.query}` : ''}`
  const body = bodyText(options.body)
  const headers: Record<string, string> = { accept: 'application/json', ...lower(options.headers) }
  if (body !== undefined) headers['content-type'] = 'application/json'
  try {
    const response = await backendRequest(address, { method, headers, body, ...(options.signal ? { signal: options.signal } : {}) })
    return { status: response.status, headers: response.headers, text: await response.text() }
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error
    setConnection('unreachable')
    throw new ApiError('Cannot reach the BackEnd.', 502, null)
  }
}

function viaStub(): Routed {
  return { status: 202, headers: new Headers({ 'content-type': 'application/json' }), text: JSON.stringify({ queued: false, stub: true }) }
}

/** The raw answer of one call: status, headers and body text. Throws ApiError for anything that is not an answer. */
async function route(address: string, options: RequestOptions): Promise<Routed> {
  const target = parseRefPath(address)
  const method = (options.method ?? 'GET').toUpperCase()
  if (BACKEND_KEYS.has(target.key)) return viaBackend(target, method, options)
  if (STUB_KEYS.has(target.key)) return viaStub()
  return viaSap(target, method, options)
}

function parse(text: string): unknown {
  if (!text) return null
  try { return JSON.parse(text) } catch { return null }
}

/**
 * One call, as the reference's gateway client made it. Returns the parsed body plus status and headers (creating an
 * entity needs OData-EntityId / Location as well as the body). `path` always starts with the service key: "/api/fx/...".
 */
export async function apiRequest<T = unknown>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
  const routed = await route(path, options)
  setConnection(routed.status === 502 ? 'unreachable' : 'connected')
  const data = parse(routed.text)
  if (routed.status >= 400) throw new ApiError(extractMessage(data, `HTTP ${routed.status}`), routed.status, data)
  return { data: data as T, status: routed.status, headers: routed.headers }
}

/** The common case: the body only. */
export async function apiFetch<T = unknown>(path: string, options?: RequestOptions): Promise<T> {
  return (await apiRequest<T>(path, options)).data
}

const NO_BODY = new Set([101, 204, 205, 304])

/**
 * `fetch` for the few reference screens that called `fetch(service(key)('$metadata'), { headers })` directly: the same
 * address, routed like apiRequest, answered as a Response (any status; only an unreachable service rejects).
 */
export async function refFetch(address: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {}
  new Headers(init.headers).forEach((value, key) => { headers[key] = value })
  const options: RequestOptions = { method: init.method ?? 'GET', headers, body: init.body ?? undefined }
  if (init.signal) options.signal = init.signal
  const routed = await route(address, options)
  return new Response(NO_BODY.has(routed.status) ? null : routed.text, { status: routed.status, headers: routed.headers })
}
