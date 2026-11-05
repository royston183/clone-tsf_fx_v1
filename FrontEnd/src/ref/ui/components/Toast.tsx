import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

export type ToastTone = 'info' | 'success' | 'error'
type Toast = { id: number; message: string; tone: ToastTone }

type ToastApi = {
  show: (message: string, tone?: ToastTone) => void
  /** Removes everything on screen. For when a later success makes an earlier error moot. */
  clear: () => void
}

const ToastContext = createContext<ToastApi | undefined>(undefined)

export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast must be used inside <ToastProvider>.')
  return api
}

export function ToastProvider({ children, timeout = 2600 }: { children: ReactNode; timeout?: number }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(0)

  const show = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = nextId.current++
      setToasts((current) => [...current, { id, message, tone }])
      // An error stays until it is replaced or dismissed; a message the user needs to act
      // on must not vanish while they are reading it.
      if (tone !== 'error') {
        setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), timeout)
      }
    },
    [timeout],
  )

  const clear = useCallback(() => setToasts([]), [])

  const api = useMemo(() => ({ show, clear }), [show, clear])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="slc-toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`slc-toast slc-toast--${toast.tone}`}>
            <span>{toast.message}</span>
            {toast.tone === 'error' ? (
              <button
                type="button"
                className="slc-toast__close"
                aria-label="Dismiss"
                onClick={() => setToasts((current) => current.filter((t) => t.id !== toast.id))}
              >
                ×
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
