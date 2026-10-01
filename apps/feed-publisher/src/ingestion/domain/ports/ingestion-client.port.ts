/**
 * Outbound port for feed ingestion reads.
 *
 * Implemented by the HTTP adapter over the ingestion-telegram feed API.
 * All reads are scoped to feed sources server-side via
 * `?type=crypto-news` (P10: this app never requests the foreign type).
 */
export interface FeedIngestedMessage {
  channelId: string;
  messageId: number;
  text: string;
  occurredAt: string;
  messageType: string;
}

export interface FeedSource {
  channelId: string;
  title: string | null;
  handle: string | null;
  type: string;
}

export abstract class FeedIngestionClientPort {
  abstract listFeedSources(): Promise<FeedSource[]>;
  abstract fetchRecentFeedMessages(
    limit: number,
    channelId?: string,
  ): Promise<FeedIngestedMessage[]>;
}
