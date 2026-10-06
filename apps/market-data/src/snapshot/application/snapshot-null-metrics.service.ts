import { Injectable } from '@nestjs/common';

/**
 * Null-reason counter for snapshot misses (plan todo 19a — metric
 * ONLY, no cron, no periodic scan, no canary worker).
 *
 * Reasons follow `.omo/notepads/dexter-null-rootcause.md` §7.6
 * (derived, never stored on the snapshot):
 * - `no-market`: every provider answered an honest empty (`'no data'`
 *   — the aggregator's fulfilled-null marker). Correct null.
 * - `transient`: at least one provider threw, timed out, or was
 *   outbound-denied. Self-heals on the next cache MISS.
 * - `cached`: a pending shell was served from cache (pre-deploy rows
 *   linger ≤30s; post-deploy this must decay to 0 — that decay is the
 *   P12-repeat proof).
 *
 * In-process counts only (the `/metrics` exporter is still GAPS-2);
 * `snapshot()` exposes them for the future exporter and specs.
 * Runbook: a rising `transient` share on canary tokens (WIF/SOL)
 * means providers are flapping — check `providerErrors`; a nonzero
 * `cached` past deploy+60s means a writer regressed — check the three
 * no-negative-cache sites (service `set`, edge interceptor, batch
 * `getOrSet`).
 */
export type SnapshotNullReason = 'no-market' | 'transient' | 'cached';

/** The aggregator's fulfilled-null marker (all providers honestly empty). */
const NO_DATA_MARKER = 'no data';

export function deriveSnapshotNullReason(input: {
  readonly servedFromCache: boolean;
  readonly providerErrors: Readonly<Record<string, string>>;
}): SnapshotNullReason {
  if (input.servedFromCache) {
    return 'cached';
  }
  const values = Object.values(input.providerErrors);
  if (values.length > 0 && values.every((value) => value === NO_DATA_MARKER)) {
    return 'no-market';
  }
  return 'transient';
}

@Injectable()
export class SnapshotNullMetricsService {
  private readonly counts = new Map<SnapshotNullReason, number>();

  public record(reason: SnapshotNullReason): void {
    this.counts.set(reason, (this.counts.get(reason) ?? 0) + 1);
  }

  public snapshot(): Record<SnapshotNullReason, number> {
    return {
      'no-market': this.counts.get('no-market') ?? 0,
      transient: this.counts.get('transient') ?? 0,
      cached: this.counts.get('cached') ?? 0,
    };
  }
}
