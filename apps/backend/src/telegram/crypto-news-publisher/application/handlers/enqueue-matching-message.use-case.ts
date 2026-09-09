import { Injectable, Logger } from '@nestjs/common';
import { EnqueueMessageDto } from '../../domain/dtos/enqueue-message.dto';
import { PublisherQueueEntry } from 'telegram/crypto-news-publisher/domain/entities/publisher-queue-entry.entity';
import { PublisherQueueRepository } from 'telegram/crypto-news-publisher/application/ports/publisher-queue.repository';

/**
 * Inputs accepted by {@link EnqueueMatchingMessageUseCase}.
 *
 * The `EnqueueMessageDto` contains all necessary data for enqueuing:
 * - FILTERED content (after ContentFilterService regex transforms)
 * - Media file paths resolved by scheduler
 * - Matched keywords (embedded at enqueue time)
 *
 * The DTO fields `publishedAt` and `ingestedAt` are Date objects
 * (converted from ISO strings by the scheduler).
 *
 * Keywords' `templateId` is FROZEN onto the queue entry — the
 * `CryptoNewsLlmAdapter` resolves the template from the entry at
 * publish time, so a later template / keyword edit does not
 * retroactively re-route an already-queued entry.
 */
export interface EnqueueMatchingMessageInput {
  readonly message: EnqueueMessageDto;
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

  private readonly logger = new Logger(EnqueueMatchingMessageUseCase.name);

  public constructor(private readonly queueRepo: PublisherQueueRepository) {}

  /**
   * Enqueue a single matched crypto-news message for publication.
   *
   * The DTO already contains all media file paths resolved by the
   * scheduler (including grouped album siblings if applicable).
   *
   * Returns the freshly-built `PublisherQueueEntry` so the caller can
   * log the persisted id (without leaking `content`). Returns `null`
   * when the matched keyword requires an image but the message has no
   * media (the entry is silently skipped, never enters the queue).
   * Throws an Error when the message carries no usable channelId.
   */
  public async execute(
    input: EnqueueMatchingMessageInput,
  ): Promise<PublisherQueueEntry | null> {
    const message = input.message;
    if (!message.channelId?.trim()) {
      // Defensive: the upstream store guarantees this is non-empty,
      // but the use case boundary is the right place to fail loudly.
      throw new Error('EnqueueMatchingMessageUseCase: missing channelId');
    }

    const matchedKeywords = message.matchedKeywords ?? [];
    const firstKeyword = matchedKeywords[0];
    if (
      firstKeyword &&
      firstKeyword.requireMedia &&
      message.media.every((m) => m.type === 'document' || m.type === 'video')
    ) {
      this.logger.debug(
        `keyword ${firstKeyword.id} (${firstKeyword.phrase}) requires image; message ${message.messageId} has no photo media — skipping`,
      );
      return null;
    }

    const imagePaths = message.media.map((m) => m.filePath);
    const entry = PublisherQueueEntry.create({
      channelId: message.channelId,
      messageId: message.messageId,
      rawContent: message.content,
      rawTitle: null, // DTO doesn't have title field
      imagePath: imagePaths.length > 0 ? imagePaths[0] : null, // First media for backward compatibility
      imagePaths,
      groupedId: null, // DTO doesn't track groupedId
      messageReceivedAt: new Date(),
      matchedKeywordIds: matchedKeywords.map((k) => k.id),
      keywordTemplateId: firstKeyword?.templateId ?? null,
      formattingEntities: null, // DTO doesn't track formatting entities
    });

    await this.queueRepo.enqueue(entry);
    return entry;
  }
}
