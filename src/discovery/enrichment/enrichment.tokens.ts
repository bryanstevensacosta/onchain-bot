/**
 * Symbol tokens used in the enrichment BC.
 *
 * Kept in a separate file to avoid circular imports between
 * `enrichment.module.ts` and `enrich-token.use-case.ts`.
 */
export const PROVIDERS = Symbol('PROVIDERS');
