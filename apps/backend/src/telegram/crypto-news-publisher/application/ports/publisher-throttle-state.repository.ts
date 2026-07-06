import { PublisherThrottleState } from 'telegram/crypto-news-publisher/domain/entities/publisher-throttle-state.entity';

/**
 * Outbound port: persistence for the publisher throttle state.
 *
 * Backed by a single-row table (`id=1`). Returns an "empty" state
 * (lastPublishAt=null) when no row exists yet.
 */
export abstract class PublisherThrottleStateRepository {
  public abstract load(): Promise<PublisherThrottleState>;
  public abstract save(state: PublisherThrottleState): Promise<void>;
}
