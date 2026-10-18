import { Injectable } from '@nestjs/common';

/**
 * Singleflight key cap (dexter plan todo 41a): at most this many
 * distinct in-flight snapshots. Past the cap the OLDEST key is evicted
 * (its owner still settles normally — eviction only drops the sharing,
 * never cancels work). Pinned number, spec-asserted under enumeration.
 */
export const SINGLEFLIGHT_MAX_KEYS = 1000;

/**
 * Singleflight adherent timeout in ms (dexter plan todo 41a): an
 * adherent (or leader) waiting longer than this rejects, WITHOUT
 * poisoning the key (the `finally` below always deletes exactly its
 * own entry, and the orphaned leader still warms the cache on success
 * for the next caller). Default covers the worst measured cold path
 * (~11.4s p95-era max + tail + conditional OHLC legs) with margin.
 * Override via `SNAPSHOT_SINGLEFLIGHT_TIMEOUT_MS` (non-finite/<=0
 * values fall back to the default).
 */
export const SINGLEFLIGHT_TIMEOUT_MS_DEFAULT = 15_000;

export function resolveSingleflightTimeoutMs(raw: string | undefined): number {
  if (raw === undefined) return SINGLEFLIGHT_TIMEOUT_MS_DEFAULT;
  const ms = Number((raw ?? '').trim());
  if (!Number.isFinite(ms) || ms <= 0) return SINGLEFLIGHT_TIMEOUT_MS_DEFAULT;
  return Math.floor(ms);
}

/**
 * Singleflight (dexter plan todo 41a): N concurrent `getSnapshot`
 * calls for the SAME normalized key collapse to ONE upstream run —
 * the leader runs, adherents await the shared promise.
 *
 * - Normalization reuses `AddressIdVo` (the caller passes the
 *   `snapshot:<chain>:<address>:<kind>` cache key built from the VO —
 *   NO new normalize function exists by design).
 * - `try/finally` delete is guaranteed (throw cleans the key —
 *   spec-pinned, so a poisoned leader can never wedge followers).
 * - Cap 1000 with LRU refresh on adherent hit (bounded cardinality
 *   under enumeration — spec-pinned).
 * - Own timeout rejects slow adherents without poisoning (late leader
 *   success still warms the snapshot cache; the key is already gone).
 * - No new libs (a Map + Promise.race is the whole primitive).
 *
 * Interposed at the `getSnapshot` entry (the single choke point every
 * edge/batch caller funnels through). Absent (hand-built specs) the
 * service calls through directly — zero behavior change.
 */
@Injectable()
export class SingleflightService {
  private readonly inflight = new Map<string, Promise<unknown>>();
  private readonly timeoutMs: number = resolveSingleflightTimeoutMs(
    process.env['SNAPSHOT_SINGLEFLIGHT_TIMEOUT_MS'],
  );

  public async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key);
    if (existing !== undefined) {
      // LRU refresh: a shared key stays (a hot token under burst
      // keeps its entry young; idle keys age out by insertion order).
      this.inflight.delete(key);
      this.inflight.set(key, existing);
      return existing as Promise<T>;
    }
    if (this.inflight.size >= SINGLEFLIGHT_MAX_KEYS) {
      const oldest = this.inflight.keys().next();
      if (!oldest.done) {
        this.inflight.delete(oldest.value);
      }
    }
    let task: Promise<T>;
    try {
      task = fn();
    } catch (err) {
      return Promise.reject(
        err instanceof Error ? err : new Error(String(err)),
      );
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const gate = new Promise<T>((_resolve, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(
              `singleflight timeout (${this.timeoutMs}ms) for ${key} — retry shortly, fail-open`,
            ),
          ),
        this.timeoutMs,
      );
      if (typeof timer.unref === 'function') {
        timer.unref();
      }
    });
    // `Promise.race` subscribes to `task`, so a late leader settle
    // after a timeout is observed (no unhandled rejection) — it just
    // no longer has adherents. The identity check below keeps an
    // evicted-then-reused key from deleting its successor's entry.
    const shared: Promise<T> = Promise.race([task, gate]).finally(() => {
      if (timer !== null) {
        clearTimeout(timer);
      }
      if (this.inflight.get(key) === (shared as Promise<unknown>)) {
        this.inflight.delete(key);
      }
    });
    this.inflight.set(key, shared);
    return shared;
  }

  /**
   * Is there an in-flight run for this key right now? (dexter plan
   * todo 21a background-refresh dedupe: the refresh caller checks
   * first so a second SWR serve never starts a second fan-out — it
   * logs `deduped` and adheres instead.)
   */
  public has(key: string): boolean {
    return this.inflight.has(key);
  }

  /** In-flight cardinality (specs + future `/metrics` exporter). */
  public size(): number {
    return this.inflight.size;
  }
}
