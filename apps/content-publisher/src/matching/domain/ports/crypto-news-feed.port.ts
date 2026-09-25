import type { CryptoNewsFeedMessage } from '../crypto-news-feed-message';

/**
 * Outbound port: typed crypto-only feed reads.
 *
 * Implementations MUST request the crypto-news slice upstream
 * (`?type=crypto-news`) AND the consumer (`FilteredCryptoNewsService`)
 * drops non-crypto rows client-side as a second barrier. No polling loop
 * lives here — scheduling is owned by EnqueueMatchingCronScheduler.
 */
export abstract class CryptoNewsFeedPort {
  public abstract fetchRecentMessages(
    limit: number,
    channelId?: string,
  ): Promise<ReadonlyArray<CryptoNewsFeedMessage>>;
}
