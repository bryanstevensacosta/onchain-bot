import { Injectable, Logger } from '@nestjs/common';
import { CryptoNewsMessage } from 'telegram/ingestion/crypto-news/domain/entities/crypto-news-message.entity';
import { CryptoNewsMessageRepository } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-message.repository';
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
 * `matchedKeywords` is the array of keywords the caller matched against
 * the message. It is optional for flexibility (match logic may evolve),
 * but in the current pipeline the handler always passes it. When
 * present, the keywords' `templateId` is FROZEN onto the queue entry —
 * the `CryptoNewsLlmAdapter` resolves the template from the entry at
 * publish time, so a later template / keyword edit does not
 * retroactively re-route an already-queued entry.
 */
export interface EnqueueMatchingMessageInput {
  readonly message: CryptoNewsMessage;
  readonly matchedKeywords: Keyword[];
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

  public constructor(
    private readonly queueRepo: PublisherQueueRepository,
    private readonly messageRepo: CryptoNewsMessageRepository,
  ) {}

  /**
   * Enqueue a single matched crypto-news message for publication.
   *
   * When the message has a `groupedId` (Telegram album), all sibling
   * messages in the same album group are found and their photo paths
   * merged into a single queue entry. This lets the publisher dispatch
   * the whole album as a single `sendMediaGroup` call instead of
   * publishing each photo individually.
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

    const matchedKeywords = input.matchedKeywords ?? [];
    const firstKeyword = matchedKeywords[0];
    if (
      firstKeyword &&
      firstKeyword.requireImage &&
      message.media.length === 0
    ) {
      this.logger.debug(
        `keyword ${firstKeyword.id} (${firstKeyword.phrase}) requires image; message ${message.id} has no media — skipping`,
      );
      return null;
    }

    const imagePaths = await this.collectAlbumImagePaths(message);
    const entry = PublisherQueueEntry.create({
      channelId: message.channelId,
      messageId: message.messageId,
      rawContent: message.content,
      rawTitle: message.title,
      imagePaths,
      groupedId: message.groupedId,
      messageReceivedAt: new Date(),
      matchedKeywordIds: matchedKeywords.map((k) => k.id),
      keywordTemplateId: firstKeyword?.templateId ?? null,
    });

    await this.queueRepo.enqueue(entry);
    return entry;
  }

  /**
   * Collect file paths from the message's own media, then (when the
   * message belongs to a Telegram album, i.e. has a `groupedId`) also
   * fetch sibling messages in the same album group and merge their
   * media paths. Deduplicates by path so the same photo is never
   * included twice.
   *
   * Returns a flat, unique array of absolute file paths.
   */
  private async collectAlbumImagePaths(
    message: CryptoNewsMessage,
  ): Promise<string[]> {
    const ownPaths = this.collectImagePaths(message);
    if (!message.groupedId) {
      return ownPaths;
    }
    try {
      const siblings = await this.messageRepo.findByChannelAndGroupedId(
        message.channelId,
        message.groupedId,
      );
      const siblingPaths = siblings
        .filter((s) => s.messageId !== message.messageId)
        .flatMap((s) => this.collectImagePaths(s));
      return [...new Set([...ownPaths, ...siblingPaths])];
    } catch (err) {
      this.logger.warn(
        `Failed to fetch grouped siblings for ${message.channelId}:${message.messageId} (groupedId=${message.groupedId}): ${(err as Error).message} — falling back to own media only`,
      );
      return ownPaths;
    }
  }

  private collectImagePaths(message: CryptoNewsMessage): string[] {
    return message.media
      .map((m) => m.filePath)
      .filter((p): p is string => p !== null && p !== undefined);
  }
}
