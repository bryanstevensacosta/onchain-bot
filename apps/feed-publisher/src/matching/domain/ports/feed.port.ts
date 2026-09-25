import type { FeedMessage } from '../feed-message';

/**
 * Outbound port: typed crypto-only feed reads.
 *
 * Implementations MUST request the feed slice upstream
 * (`?type=crypto-news`) AND the consumer (`FilteredFeedService`)
 * drops non-crypto rows client-side as a second barrier. No polling loop
 * lives here — scheduling is owned by EnqueueMatchingCronScheduler.
 */
export abstract class FeedPort {
  public abstract fetchRecentMessages(
    limit: number,
    channelId?: string,
  ): Promise<ReadonlyArray<FeedMessage>>;
}
