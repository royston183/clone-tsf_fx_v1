import type { ReactNode } from 'react'

/** The TSF_FX shell already gates every screen behind its login. */
export function RequireAuth({ children }: { children: ReactNode }) {
  return <>{children}</>
}
