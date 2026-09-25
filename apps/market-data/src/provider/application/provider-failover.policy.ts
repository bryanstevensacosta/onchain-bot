import type { ProviderKind } from '../domain/provider-descriptor';
import type { ProviderStatus } from '../domain/provider-health.vo';

/**
 * ProviderFailoverPolicy (Tramo 3, provider-hex).
 *
 * Deterministic preference order over a status snapshot: healthy first
 * (up > degraded > unknown > down), then lowest latency (nulls last),
 * then fewest errors, then name for stability. Pure function — no state,
 * no I/O. Additive surface only; the registry exposes it via
 * `listFailoverOrder` without touching existing behavior.
 */
const STATUS_RANK: Record<ProviderStatus['status'], number> = {
  up: 0,
  degraded: 1,
  unknown: 2,
  down: 3,
};

export class ProviderFailoverPolicy {
  public static order(
    statuses: ReadonlyArray<ProviderStatus>,
    kind?: ProviderKind,
  ): ReadonlyArray<string> {
    const pool =
      kind === undefined
        ? statuses
        : statuses.filter((status) => status.kind === kind);
    return [...pool]
      .sort((a, b) => {
        const byStatus = STATUS_RANK[a.status] - STATUS_RANK[b.status];
        if (byStatus !== 0) {
          return byStatus;
        }
        const aLatency = a.latencyMs ?? Number.MAX_SAFE_INTEGER;
        const bLatency = b.latencyMs ?? Number.MAX_SAFE_INTEGER;
        if (aLatency !== bLatency) {
          return aLatency - bLatency;
        }
        if (a.errorCount !== b.errorCount) {
          return a.errorCount - b.errorCount;
        }
        return a.name.localeCompare(b.name);
      })
      .map((status) => status.name);
  }
}
