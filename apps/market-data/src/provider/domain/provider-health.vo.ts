import type { ProviderDescriptor } from './provider-descriptor';

/**
 * ProviderHealth value objects (Tramo 3, provider-hex).
 *
 * Health vocabulary for the provider registry. Moved verbatim out of
 * `ProviderRegistryService` (no semantics change): the rolling
 * latency/error/last-check snapshot plus the derived status. The
 * derivation truth table lives in
 * `application/provider-health-checker.service`.
 */
export type ProviderHealth = 'up' | 'degraded' | 'down' | 'unknown';

export interface ProviderStatus {
  readonly name: string;
  readonly kind: string;
  readonly status: ProviderHealth;
  readonly latencyMs: number | null;
  readonly errorCount: number;
  readonly lastCheckAt: string | null;
}

export interface ProviderHealthSnapshot {
  readonly descriptor: ProviderDescriptor;
  readonly errorCount: number;
  readonly latencyMs: number | null;
  readonly lastCheckAt: string | null;
}
