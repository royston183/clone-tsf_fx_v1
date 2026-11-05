import { useConnectionState } from '@/ref/api-client/react'

const LABELS = {
  connected: 'System connected',
  unreachable: 'Cannot reach SAP through the gateway',
  unknown: 'Connection not yet checked',
} as const

/**
 * Mirrors the gateway connection state. "unreachable" means specifically that the gateway
 * could not reach the backend (HTTP 502) or that the gateway itself is down — never that
 * a request was merely rejected, so a failed save does not read as an outage.
 */
export function ConnectionIndicator() {
  const state = useConnectionState()
  return (
    <span className={`slc-conn slc-conn--${state}`} title={LABELS[state]}>
      <span className="slc-conn__dot" aria-hidden="true" />
      <span className="slc-visually-hidden">{LABELS[state]}</span>
    </span>
  )
}
