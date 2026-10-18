import { Injectable } from '@nestjs/common';
import {
  resolvePendingAgingN,
  resolvePendingAgingWindowMs,
} from '../domain/snapshot-latency';

/**
 * In-flight key cap (LRU-by-insertion): past the cap the OLDEST entry
 * is evicted. Same precedent as `SingleflightService` — bounded
 * cardinality under enumeration, eviction only drops history.
 */
export const PENDING_AGING_MAX_KEYS = 1000;

export interface PendingAgingVerdict {
  /** Consecutive pendings observed for this key (>= 1). */
  readonly count: number;
  /** `count >= escalationThreshold` — the caller serves `invalid`. */
  readonly escalated: boolean;
}

/**
 * Pending aging (dexter plan todo 21d): counts CONSECUTIVE pending
 * serves per (chain, address, kind) so a permanently-unknown address
 * converges to a differentiated `invalid` instead of pending forever.
 *
 * - `SNAPSHOT_PENDING_AGING_N` (default 3) consecutive pendings within
 *   `SNAPSHOT_PENDING_AGING_WINDOW_MS` (default 10 min) escalate.
 * - A window gap (or a clock going backwards) RESTARTS the streak at 1
 *   — two isolated pendings hours apart never escalate.
 * - The escalated entry is KEPT: every further pending re-escalates
 *   until fresh data (or a definitive existence verdict) clears it.
 * - `record` is called ONLY on the serve path that would answer
 *   `pending` (never by the background refresh).
 *
 * In-memory Map + reset-on-deploy ACCEPTED (same rule as the breaker
 * and the governor — documented, not hidden). No cron, no timers.
 */
@Injectable()
export class PendingAgingService {
  private readonly entries = new Map<
    string,
    { readonly count: number; readonly lastAt: number }
  >();

  /** `SNAPSHOT_PENDING_AGING_N` (read once at construction). */
  public readonly escalationThreshold: number = resolvePendingAgingN(
    process.env['SNAPSHOT_PENDING_AGING_N'],
  );

  /** `SNAPSHOT_PENDING_AGING_WINDOW_MS` (read once at construction). */
  public readonly escalationWindowMs: number = resolvePendingAgingWindowMs(
    process.env['SNAPSHOT_PENDING_AGING_WINDOW_MS'],
  );

  /**
   * Record one pending serve. Same key within the window increments;
   * a gap wider than the window (or `nowMs` not moving forward)
   * restarts at 1.
   */
  public record(
    key: string,
    kind: string,
    nowMs: number = Date.now(),
  ): PendingAgingVerdict {
    const entryKey = `${key}:${kind}`;
    const existing = this.entries.get(entryKey);
    if (existing !== undefined) {
      // LRU refresh (delete + re-set below).
      this.entries.delete(entryKey);
    }
    const continued =
      existing !== undefined &&
      nowMs >= existing.lastAt &&
      nowMs - existing.lastAt <= this.escalationWindowMs;
    const count = continued ? existing.count + 1 : 1;
    if (this.entries.size >= PENDING_AGING_MAX_KEYS) {
      const oldest = this.entries.keys().next();
      if (!oldest.done) {
        this.entries.delete(oldest.value);
      }
    }
    this.entries.set(entryKey, { count, lastAt: nowMs });
    return { count, escalated: count >= this.escalationThreshold };
  }

  /**
   * Clear the streak (fresh `ready` data served, SWR serve, or a
   * definitive existence verdict — the address is not silently
   * pending anymore).
   */
  public clear(key: string, kind: string): void {
    this.entries.delete(`${key}:${kind}`);
  }

  /** In-memory cardinality (specs + future `/metrics` exporter). */
  public size(): number {
    return this.entries.size;
  }
}
