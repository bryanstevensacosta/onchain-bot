/**
 * Queue row lookup (R-b1, matching side).
 *
 * Structural subset of the moved `PublisherQueueEntry`: only what the
 * per-message status view reads. The unified queue moved to
 * `apps/publishing-queue/`; unbound (null) until the B1 dual provides
 * the HTTP lookup — the status view then degrades to the live verdict
 * plus `queue: null`.
 */
export interface MessageQueueRow {
  readonly status: string;
  readonly attempts: number;
  readonly blockedReason: string | null;
  readonly lastError: string | null;
  readonly telegramMessageId: string | null;
  readonly matchedKeywordIds: ReadonlyArray<string>;
  readonly rawTitle: string | null;
  readonly rawContent: string;
}

export abstract class MessageQueueLookupPort {
  public abstract findTracked(
    channelId: string,
    messageId: number,
  ): Promise<MessageQueueRow | null>;
}
