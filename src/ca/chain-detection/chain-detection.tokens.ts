/**
 * Symbol tokens used in the chain-detection BC.
 *
 * Kept in a separate file to avoid circular imports between
 * `chain-detection.module.ts` and `detect-chain.use-case.ts`
 * (the use case needs the symbol; the module defines the provider).
 */
export const CHAIN_PROBERS = Symbol('CHAIN_PROBERS');
