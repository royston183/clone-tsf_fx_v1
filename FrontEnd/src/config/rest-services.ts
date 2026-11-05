import list from './rest-services.json';

/**
 * External REST data services the BackEnd calls for modules with source `rest` (FE + BE + DB only), listed in
 * `rest-services.json`. `base` is the service root (the part before `data/<resource>`); the BackEnd environment's
 * `REST_<KEY>_URL` (the key upper-cased, other characters as `_`) overrides it, and `REST_<KEY>_AUTHORIZATION`, when
 * set, is sent as the Authorization header. Never put a secret in this file.
 */
export interface RestServiceDef { key: string; title: string; base: string }

export const REST_SERVICES: RestServiceDef[] = list as RestServiceDef[];

/** The environment variable that overrides a REST service's base URL (`slc-middleware` → `REST_SLC_MIDDLEWARE_URL`). */
export const restEnvName = (key: string, what: 'URL' | 'AUTHORIZATION'): string => `REST_${key.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_${what}`;
