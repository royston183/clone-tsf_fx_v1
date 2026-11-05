import { apiFetch, service } from '@/ref/api-client'

const middlewareApi = service('middleware')

/** One entity-string row as the forms use it; each console re-exports the type. */
export type EntityRow = { ZentId?: string; ZentDesc?: string; Zent1?: string; Zent2?: string }

/** The middleware answers with SAP's raw column names, not the OData service's camel-cased ones. */
type MiddlewareEntityRow = {
  ZENT_ID?: string
  ZENT_DESC?: string
  ZENT1?: string
  ZENT2?: string
}

/**
 * Entity String comes from the middleware rather than the OTTK OData service: the middleware
 * reads ZSGTSFTR_ENT_STR directly, so a new entity row is visible without an ABAP transport.
 * Both consoles read the same list, hence one loader here rather than a copy in each.
 *
 * Three differences from the OData service, all handled here:
 *  - the payload is `{ ok, rows }` rather than a `value` collection;
 *  - the columns keep SAP's raw table names and are mapped to the EntityRow the forms speak;
 *  - the table holds every entity, not just the SLC ones, so ZSLC is filtered on. 'X' is
 *    SAP's abap_true marker: the row is flagged for SLC use.
 *
 * Both the filter and the limit are pushed to the middleware, which rejects a parameter it
 * does not recognise rather than ignoring it. The limit is explicit because it pages at 50
 * by default — a silently truncated dropdown reads as missing master data.
 */
export async function loadEntityStrings(signal?: AbortSignal): Promise<EntityRow[]> {
  const body = await apiFetch<{ rows?: MiddlewareEntityRow[] }>(
    `${middlewareApi('data/entityString')}?ZSLC=X&limit=1000`,
    signal ? { signal } : undefined,
  )
  return (body?.rows ?? []).map((row) => ({
    ZentId: row.ZENT_ID ?? '',
    ZentDesc: row.ZENT_DESC ?? '',
    Zent1: row.ZENT1 ?? '',
    Zent2: row.ZENT2 ?? '',
  }))
}
