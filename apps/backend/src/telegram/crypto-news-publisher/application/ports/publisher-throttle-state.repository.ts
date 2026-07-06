import { PublisherThrottleState } from 'telegram/crypto-news-publisher/domain/entities/publisher-throttle-state.entity';

/**
 * Outbound port: persistence for the publisher throttle state.
 *
 * Backed by a single-row table (`id=1`). Returns an "empty" state
 * (lastPublishAt=null) when no row exists yet.
 *
 * Two access shapes:
 * - `load()` / `save(state)` — domain-typed (return the immutable
 *   aggregate). Used by callers that want to compute a new state
 *   from an existing one (`state.withLastPublishAt(...)`).
 * - `getLastPublishAt()` / `setLastPublishAt(at)` — primitive-typed
 *   convenience methods. Used by the cron publisher where a full
 *   aggregate round-trip is not required.
 */
export abstract class PublisherThrottleStateRepository {
  public abstract load(): Promise<PublisherThrottleState>;
  public abstract save(state: PublisherThrottleState): Promise<void>;
  public abstract getLastPublishAt(): Promise<Date | null>;
  public abstract setLastPublishAt(at: Date): Promise<void>;
}
