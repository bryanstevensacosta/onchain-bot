import { Injectable, Logger } from '@nestjs/common';
import { FeedPort } from '../../domain/ports/feed.port';
import type { FeedMessage } from '../../domain/feed-message';
import { FeedIngestionClientPort } from '../../../ingestion/domain/ports/ingestion-client.port';

/**
 * `FeedPort` over the ingestion module feed reads.
 *
 * Requests the crypto-news slice (`?type=crypto-news` inside the port
 * adapter) and maps rows to the typed message shape. Rows whose runtime
 * marker is not feed are normalized to the crypto literal only
 * when the marker is absent (pre-unified fixtures); foreign-typed rows
 * are dropped here AND again in FilteredFeedService (defense in
 * depth, P10).
 *
 * Media note: the todo-2 feed port carries text only, so rows arrive
 * with `media: []` (hasMedia=false). Media-aware fetches land with the
 * queue todo, which needs sibling media for album merge.
 */
@Injectable()
export class IngestionFeedAdapter extends FeedPort {
  private readonly logger = new Logger(IngestionFeedAdapter.name);

  public constructor(
    private readonly ingestion: FeedIngestionClientPort,
  ) {
    super();
  }

  public async fetchRecentMessages(
    limit: number,
    channelId?: string,
  ): Promise<ReadonlyArray<FeedMessage>> {
    const rows = await this.ingestion.fetchRecentFeedMessages(
      limit,
      channelId,
    );
    const out: FeedMessage[] = [];
    for (const row of rows) {
      const marker = row.messageType;
      if (marker !== undefined && marker !== 'crypto-news') {
        this.logger.debug(
          `Dropping foreign feed row ${row.channelId}:${row.messageId} (type=${marker})`,
        );
        continue;
      }
      out.push({
        channelId: row.channelId,
        messageId: row.messageId,
        title: null,
        content: row.text,
        publishedAt: row.occurredAt,
        ingestedAt: row.occurredAt,
        media: [],
        groupedId: null,
        messageType: 'crypto-news',
      });
    }
    return out;
  }
}
