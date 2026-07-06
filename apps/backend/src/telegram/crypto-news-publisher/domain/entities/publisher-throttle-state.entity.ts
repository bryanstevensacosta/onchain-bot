/**
 * Persisted single-row state for the crypto-news publisher's throttle.
 *
 * The cron publisher refuses to fire two posts back-to-back — it
 * enforces a 3-15 min random delay between consecutive publishes plus
 * a 36-posts/day cap. Both knobs rely on `lastPublishAt`, which MUST be
 * persisted: an in-memory value would reset on restart and let the
 * cron fire a burst of publishes immediately after boot.
 *
 * Persisted shape (id=1 fixed — there is exactly one row):
 *   `id`            — always 1 (singleton)
 *   `last_publish_at` — nullable; null means "never published yet"
 */
export class PublisherThrottleState {
  private constructor(public readonly lastPublishAt: Date | null) {}

  /**
   * Factory: build a fresh "never published" state.
   */
  public static empty(): PublisherThrottleState {
    return new PublisherThrottleState(null);
  }

  /**
   * Factory: build a state with a known lastPublishAt (used after
   * reading from the DB on boot).
   */
  public static fromLastPublishAt(at: Date | null): PublisherThrottleState {
    return new PublisherThrottleState(at);
  }

  /**
   * Return a new state with `lastPublishAt` advanced to `now`. The
   * original instance is immutable; consumers must use the returned
   * value when persisting.
   */
  public withLastPublishAt(at: Date): PublisherThrottleState {
    return new PublisherThrottleState(at);
  }

  /**
   * The fixed primary-key value for the singleton row. Hard-coded so
   * the cron + repo always read/write the same row.
   */
  public static readonly SINGLETON_ID = 1;
}
