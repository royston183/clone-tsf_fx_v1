// Hosts a ported reference screen: the wrapper the reference's App.tsx put around every feature (`#alm-fx-ui`, the toast
// provider, the select / datalist search, the backdrop guard) and the stylesheets the screens rely on.
// A page registers a ported feature with `refPage(Feature, { office })` (see README.md).
import { useEffect, useRef, type ComponentType } from 'react'
import { ToastProvider } from './ui/index.ts'
import { SelectSearch } from './shared/SelectSearch.tsx'
import { DatalistSuggest } from './shared/DatalistSuggest.tsx'
import { installBackdropGuard } from './shared/ui/backdrop-guard.ts'
import './host.css'
import { watchReferenceTables } from './shared/table-alignment'
import './shared/fx/alm-theme.css'
import './shared/fx/office-theme.css'
import './shared/fx/tf-theme.css'
import './shared/master-contract/design.css'

export type RefHostOptions = {
  /** The Mid / Back Office screens (`data-office`); the reference's ALM_FX_OFFICE_FEATURES. */
  office?: boolean
  /** False for a screen the reference did not wrap in `#alm-fx-ui` (ottk, dttk, deal-id, ...). Default true. */
  alm?: boolean
}

export function RefHost({ children, office = false, alm = true }: RefHostOptions & { children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null)
  // The reference's tokens (--bg, --blue, ...) are scoped to .slc-ref and to the popups it portals into <body>; this class
  // switches the second scope on only while a ported screen is mounted.
  useEffect(() => {
    document.body.classList.add('slc-ref-active')
    const uninstall = installBackdropGuard()
    const stopAlignment = watchReferenceTables(root.current)
    return () => {
      document.body.classList.remove('slc-ref-active')
      uninstall()
      stopAlignment()
    }
  }, [])
  return (
    <ToastProvider>
      <SelectSearch />
      <DatalistSuggest />
      <div ref={root} className="slc-ref" id={alm ? 'alm-fx-ui' : undefined} data-office={office ? 'true' : undefined}>
        {children}
      </div>
    </ToastProvider>
  )
}

/** A ported feature (its default export) as a page component for src/pages/registry.ts. */
export function refPage(Feature: ComponentType, options: RefHostOptions = {}): ComponentType {
  return function RefPage() {
    return (
      <RefHost {...options}>
        <Feature />
      </RefHost>
    )
  }
}
