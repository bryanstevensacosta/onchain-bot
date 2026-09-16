/**
 * Persisted single-row state for the Threads publish throttle.
 *
 * The throttle refuses to fire two posts back-to-back — it enforces a
 * configurable random delay between consecutive publishes. The rule
 * relies on `lastPublishAt`, which MUST be persisted so a backend
 * restart does not reset the throttle and allow a burst of publishes
 * immediately after boot.
 *
 * Persisted shape (id=1 fixed — there is exactly one row):
 *   `id`              — always 1 (singleton)
 *   `last_publish_at` — nullable; null means "never published yet"
 *
 * Persistence: @Entity({ name: 'threads_throttle_states' }) counterpart lives in
 * `threads/publisher/infrastructure/persistence/typeorm/entities/` (this domain
 * file owns the value semantics only, never the ORM decorator).
 */
export class ThreadsThrottleState {
  private constructor(public readonly lastPublishAt: Date | null) {}

  /**
   * Factory: build a fresh "never published" state.
   */
  public static empty(): ThreadsThrottleState {
    return new ThreadsThrottleState(null);
  }

  /**
   * Factory: build a state with a known lastPublishAt (used after
   * reading from the DB on boot).
   */
  public static fromLastPublishAt(at: Date | null): ThreadsThrottleState {
    return new ThreadsThrottleState(at);
  }

  /**
   * Return a new state with `lastPublishAt` advanced to `now`. The
   * original instance is immutable; consumers must use the returned
   * value when persisting.
   */
  public withLastPublishAt(at: Date): ThreadsThrottleState {
    return new ThreadsThrottleState(at);
  }

  /**
   * The fixed primary-key value for the singleton row. Hard-coded so
   * the scheduler + repo always read/write the same row.
   */
  public static readonly SINGLETON_ID = 1;
}
