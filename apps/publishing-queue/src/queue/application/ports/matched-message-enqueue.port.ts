/**
 * Queue-owned matched-message contract (R-b1, gateway side).
 *
 * Structural subset of the feed-publisher `FilteredFeedMessage`: only
 * what the enqueue path reads (identity + filtered content + media
 * gate + keyword refs). Matching evaluation, keyword entities, and
 * blacklist logic stay in feed-publisher per R6 — nothing here
 * decides a match, it only carries one.
 */
export interface MatchedFeedMedia {
  readonly index: number;
  readonly type: string;
}

export interface MatchedFeedKeyword {
  readonly id?: string;
  readonly requireMedia?: boolean;
  readonly templateId?: string | null;
}

export interface MatchedFeedMessage {
  readonly channelId: string;
  readonly messageId: number;
  readonly title: string | null;
  readonly content: string;
  readonly groupedId: string | null;
  readonly media: ReadonlyArray<MatchedFeedMedia>;
  readonly matchedKeywords: ReadonlyArray<MatchedFeedKeyword>;
}

export interface MatchedEnqueueResult {
  readonly enqueued: boolean;
}

/**
 * Outbound port: handoff of a matched message toward the unified queue.
 */
export abstract class MatchedMessageEnqueuePort {
  public abstract enqueue(
    message: MatchedFeedMessage,
  ): Promise<MatchedEnqueueResult>;
}
