import { apiFetch, service } from '@/ref/api-client'

const middlewareApi = service('middleware')

/** One company-code mapping as the forms use it; each console re-exports the type. */
export type CoCodeRow = { ZcomId?: string; Zbukrs?: string; Butxt?: string }

/** The middleware answers with SAP's raw column names, not the OData service's camel-cased ones. */
type MiddlewareCompRow = {
  ZCOM_ID?: string
  ZBUKRS?: string
  ZBUTXT?: string
}

/**
 * Company codes come from the middleware rather than the OTTK OData service, which reads
 * ZSGTSFTR_COMP directly. Both consoles use the same mapping, hence one loader here.
 *
 * The forms only ever look a row up by ZcomId — `withCoCode` matches the LC applicant and
 * fills Company Code and its name — so the full row is narrowed to the three fields that
 * drives, and rows with no ZCOM_ID are left in place: a blank applicant returns before the
 * lookup, so they can never match.
 *
 * The limit is explicit for the same reason as the other middleware lookups: it pages by
 * default, and a silently truncated mapping would show as Company Code simply not filling in.
 */
export async function loadCoCodes(signal?: AbortSignal): Promise<CoCodeRow[]> {
  const body = await apiFetch<{ rows?: MiddlewareCompRow[] }>(
    `${middlewareApi('data/comp')}?limit=1000`,
    signal ? { signal } : undefined,
  )
  return (body?.rows ?? []).map((row) => ({
    ZcomId: row.ZCOM_ID ?? '',
    Zbukrs: row.ZBUKRS ?? '',
    Butxt: row.ZBUTXT ?? '',
  }))
}
