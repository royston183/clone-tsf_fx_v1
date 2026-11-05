/**
 * An error the backend answered with. Carries the HTTP status so callers can tell a
 * validation failure from an outage without re-parsing anything.
 */
export class ApiError extends Error {
  readonly status: number
  readonly body: unknown

  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }

  /**
   * 502 is the gateway's own signal that it reached out to the backend and failed
   * (network, TLS, timeout) — the backend never returns it. It is therefore the only
   * status that means "not connected"; a 400 on a bad save must not read as an outage.
   */
  get isUnreachable(): boolean {
    return this.status === 502
  }

  get isUnauthenticated(): boolean {
    return this.status === 401
  }
}

/**
 * Pulls the human-readable message out of a backend error body. Handles the three shapes
 * seen in practice: OData V4 ({error:{message}}), OData V2 ({error:{message:{value}}}),
 * and SAP's own SAP__Messages array.
 */
export function extractMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- error bodies of three shapes, read defensively
  const record = body as Record<string, any>

  const message = record['error']?.['message']
  if (typeof message === 'string') return message
  if (typeof message?.['value'] === 'string') return message['value']

  const sapMessage = record['SAP__Messages']?.[0]?.['message']
  if (typeof sapMessage === 'string') return sapMessage

  return fallback
}
