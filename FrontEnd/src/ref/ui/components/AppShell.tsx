import { FS_SHORT_LOGO } from '@/ref/shared/fx/logo'
import type { ReactNode } from 'react'
import { ConnectionIndicator } from './ConnectionIndicator.tsx'

export const FS_LOGO =
  FS_SHORT_LOGO

export type AppShellProps = {
  title: string
  /** The SAP service or transaction code, shown small beside the title. */
  subtitle?: string
  /** Rendered at the left of the header — normally a "back to menu" link. */
  nav?: ReactNode
  actions?: ReactNode
  children: ReactNode
}

/**
 * The frame every application sits in: one header, one content region. Each legacy page
 * rebuilt this markup and its CSS independently, which is why the seven of them disagreed
 * on header height, brand colour and corner radius.
 */
export function AppShell({ title, subtitle, nav, actions, children }: AppShellProps) {
  return (
    <div className="slc-shell">
      <header className="slc-shell__header">
        <div className="slc-shell__brand">
          {nav}
          <img className="slc-shell__mark" src={FS_LOGO} alt="" />
          <h1 className="slc-shell__title">
            {title}
            {subtitle ? <small>{subtitle}</small> : null}
          </h1>
        </div>
        <div className="slc-shell__actions">
          {actions}
          <ConnectionIndicator />
        </div>
      </header>
      <main className="slc-shell__main">{children}</main>
    </div>
  )
}
