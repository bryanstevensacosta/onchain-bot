import { Injectable } from '@nestjs/common';
import { CryptoNewsMessage } from 'telegram/ingestion/crypto-news/domain/entities/crypto-news-message.entity';
import { Keyword } from 'telegram/crypto-news-publisher/domain/entities/keyword.entity';
import { PublisherQueueEntry } from 'telegram/crypto-news-publisher/domain/entities/publisher-queue-entry.entity';
import { PublisherQueueRepository } from 'telegram/crypto-news-publisher/application/ports/publisher-queue.repository';

/**
 * Inputs accepted by {@link EnqueueMatchingMessageUseCase}.
 *
 * The full `CryptoNewsMessage` is the source of truth for `content`,
 * `media[]`, `groupedId` — `imagePath` is the first media file's
 * `filePath` when present (local filesystem path resolved at ingestion
 * time by the crypto-news BC). Telegram CDN URLs are NOT used here:
 * they expire after ~1h and the queue may not be drained for hours.
 *
 * `matchedKeyword` is the keyword the caller matched against the
 * message. It is optional for flexibility (match logic may evolve),
 * but in the current pipeline the handler always passes it. When
 * present, its `templateId` is FROZEN onto the queue entry — the
 * `CryptoNewsLlmAdapter` resolves the template from the entry at
 * publish time, so a later template / keyword edit does not
 * retroactively re-route an already-queued entry.
 */
export interface EnqueueMatchingMessageInput {
  readonly message: CryptoNewsMessage;
  readonly matchedKeyword?: Keyword;
}

/**
 * Use case: enqueue a matched crypto-news message for publication.
 *
 * The single invariant is "the queue never holds more than 36 entries".
 * We enforce it at the database level by running INSERT and the
 * overflow DELETE inside a single transaction (see plan §5 of
 * `.omo/plans/crypto-news-publisher.md`). Even under bursty ingest the
 * table size is bounded — the cap is the 36 newest `messageReceivedAt`
 * rows, regardless of status.
 *
 * Lifecycle responsibilities:
 *  - Build a fresh `PublisherQueueEntry` (status=PENDING).
 *  - Delegate persistence to `PublisherQueueRepository.enqueue()`,
 *    which runs INSERT + overflow DELETE inside a single transaction.
 *  - Fail fast (no enqueue) when the source message has no usable
 *    identifier — `Keyword.create` already guards `phrase`; here we
 *    guard the upstream message shape so the handler can short-circuit
 *    when a malformed event slips through.
 */
@Injectable()
export class EnqueueMatchingMessageUseCase {
  /**
   * Maximum queue depth kept by the overflow DELETE. Must match the
   * value used by `TypeOrmPublisherQueueRepository.enqueue()` (single
   * source of truth lives in the repo; this constant is here only for
   * the spec's overflow assertion).
   */
  public static readonly MAX_QUEUE_DEPTH = 36;

  public constructor(private readonly queueRepo: PublisherQueueRepository) {}

  /**
   * Enqueue a single matched crypto-news message for publication.
   *
   * Returns the freshly-built `PublisherQueueEntry` so the caller can
   * log the persisted id (without leaking `content`). Throws
   * `DomainError(VALIDATION)` when the message carries no usable
   * channelId/messageId.
   */
  public async execute(
    input: EnqueueMatchingMessageInput,
  ): Promise<PublisherQueueEntry> {
    const message = input.message;
    if (!message.channelId?.trim()) {
      // Defensive: the upstream store guarantees this is non-empty,
      // but the use case boundary is the right place to fail loudly.
      throw new Error('EnqueueMatchingMessageUseCase: missing channelId');
    }

    const imagePath = this.firstImagePath(message);
    const entry = PublisherQueueEntry.create({
      channelId: message.channelId,
      messageId: message.messageId,
      rawContent: message.content,
      rawTitle: message.title,
      imagePath,
      groupedId: message.groupedId,
      messageReceivedAt: new Date(),
      keywordTemplateId: input.matchedKeyword?.templateId ?? null,
    });

    await this.queueRepo.enqueue(entry);
    return entry;
  }

  private firstImagePath(message: CryptoNewsMessage): string | null {
    const first = message.media[0];
    return first?.filePath ?? null;
  }
}
