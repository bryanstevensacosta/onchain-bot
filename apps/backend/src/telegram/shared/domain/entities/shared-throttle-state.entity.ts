/**
 * Persisted single-row state for a shared publish throttle.
 *
 * Shared across publisher BCs (crypto-news, ads). The throttle refuses
 * to fire two posts back-to-back — it enforces a configurable random
 * delay between consecutive publishes. The rule relies on
 * `lastPublishAt`, which MUST be persisted so a backend restart does
 * not reset the throttle and allow a burst of publishes immediately
 * after boot.
 *
 * Persisted shape (id=1 fixed — there is exactly one row per throttle):
 *   `id`              — always 1 (singleton)
 *   `last_publish_at` — nullable; null means "never published yet"
 *
 * This is the shared-kernel twin of the old
 * `crypto-news-publisher/.../publisher-throttle-state.entity.ts`,
 * extracted so the ads BC can own its own throttle state backed by the
 * same contract against a different table.
 */
export class SharedThrottleState {
  private constructor(public readonly lastPublishAt: Date | null) {}

  /**
   * Factory: build a fresh "never published" state.
   */
  public static empty(): SharedThrottleState {
    return new SharedThrottleState(null);
  }

  /**
   * Factory: build a state with a known lastPublishAt (used after
   * reading from the DB on boot).
   */
  public static fromLastPublishAt(at: Date | null): SharedThrottleState {
    return new SharedThrottleState(at);
  }

  /**
   * Return a new state with `lastPublishAt` advanced to `now`. The
   * original instance is immutable; consumers must use the returned
   * value when persisting.
   */
  public withLastPublishAt(at: Date): SharedThrottleState {
    return new SharedThrottleState(at);
  }

  /**
   * The fixed primary-key value for the singleton row. Hard-coded so
   * the scheduler + repo always read/write the same row.
   */
  public static readonly SINGLETON_ID = 1;
}
