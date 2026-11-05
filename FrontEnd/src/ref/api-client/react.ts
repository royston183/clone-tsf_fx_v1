import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { apiFetch } from './http.ts'
import { getConnectionState, onConnectionChange } from './http.ts'
import type { ConnectionState, RequestOptions } from './http.ts'
import { ApiError } from './errors.ts'
import { requestTask } from '../shared/request-task'

/** Live gateway connection state, for the shell's indicator. */
export function useConnectionState(): ConnectionState {
  return useSyncExternalStore(onConnectionChange, getConnectionState, () => 'unknown' as const)
}

export type AsyncState<T> = {
  data: T | undefined
  error: ApiError | Error | undefined
  loading: boolean
  reload: () => void
}

/**
 * Runs an async loader and tracks its state, with two things hand-rolled loaders usually
 * get wrong: the request is aborted when the component unmounts or the inputs change, and
 * a response that arrives after a newer request was started is discarded rather than
 * overwriting fresher data.
 *
 * `deps` controls when it re-runs, exactly like useEffect.
 */
export function useAsync<T>(loader: (signal: AbortSignal) => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<{ data: T | undefined; error: Error | undefined; loading: boolean }>({
    data: undefined,
    error: undefined,
    loading: true,
  })
  const [nonce, setNonce] = useState(0)
  const latest = useRef(0)

  useEffect(() => {
    return requestTask(() => {
    const generation = ++latest.current
    const controller = new AbortController()
    setState((prev) => ({ ...prev, loading: true }))

    loader(controller.signal).then(
      (data) => {
        if (generation !== latest.current || controller.signal.aborted) return
        setState({ data, error: undefined, loading: false })
      },
      (error: unknown) => {
        if (generation !== latest.current || controller.signal.aborted) return
        setState({ data: undefined, error: error instanceof Error ? error : new Error(String(error)), loading: false })
      },
    )

    return () => controller.abort()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return { ...state, reload }
}

/** `useAsync` for the common case of one GET. */
export function useApi<T>(path: string | undefined, options?: RequestOptions): AsyncState<T> {
  return useAsync<T>(
    (signal) => {
      if (!path) return Promise.resolve(undefined as T)
      return apiFetch<T>(path, { ...options, signal })
    },
    [path],
  )
}
