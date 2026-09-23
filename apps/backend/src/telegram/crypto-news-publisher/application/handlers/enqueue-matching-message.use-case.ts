import { Injectable, Logger, Optional } from '@nestjs/common';
import { EnqueueMessageDto } from '../../domain/dtos/enqueue-message.dto';
import { PublisherQueueEntry } from 'telegram/crypto-news-publisher/domain/entities/publisher-queue-entry.entity';
import { PublisherQueueRepository } from 'telegram/crypto-news-publisher/application/ports/publisher-queue.repository';
import {
  DeduplicationService,
  type DedupResult,
} from 'shared/deduplication/application/services/deduplication.service';

/**
 * Dedup source partition for crypto-news publisher fingerprints.
 * Stored via `DeduplicationService.markAsSeen()` on the publish path
 * and queried here before enqueue. A dedicated partition keeps
 * publisher history separate from any other producer sharing the
 * dedup store.
 */
export const CRYPTO_NEWS_DEDUP_SOURCE = 'crypto-news-publisher';

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
 *  - Run the semantic-dedup check (exact → content → semantic) against
 *    fingerprints stored on the publish path; on a hit the entry is
 *    persisted as BLOCKED with `duplicate_of_*` refs instead of PENDING.
 *    The check is fail-open: any dedup failure enqueues normally.
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
    @Optional() private readonly dedupService?: DeduplicationService,
  ) {}

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
      groupedId: message.groupedId ?? null,
      messageReceivedAt: new Date(),
      matchedKeywordIds: matchedKeywords.map((k) => k.id),
      keywordTemplateId: firstKeyword?.templateId ?? null,
      formattingEntities: null, // DTO doesn't track formatting entities
    });

    const duplicate = await this.findDuplicate(
      message.channelId,
      message.messageId,
      message.content,
    );
    if (duplicate) {
      if (await this.isAlreadyTracked(message.channelId, message.messageId)) {
        this.logger.debug(
          `duplicate ${message.channelId}:${message.messageId} already tracked in queue — skipping (${duplicate.reason})`,
        );
        return null;
      }
      entry.markBlocked(duplicate.reason, {
        channelId: duplicate.channelId,
        messageId: duplicate.messageId,
        entryId: duplicate.entryId,
      });
      await this.queueRepo.enqueue(entry);
      this.logger.log(
        `duplicate ${message.channelId}:${message.messageId} BLOCKED (${duplicate.reason})` +
          ` of ${duplicate.channelId ?? '?'}:${duplicate.messageId ?? '?'}`,
      );
      return entry;
    }

    await this.queueRepo.enqueue(entry);
    return entry;
  }

  /**
   * Dedup probe: exact → content → semantic (with URL-overlap signal).
   * Returns the duplicate refs on a hit, `null` when unique. Fail-open:
   * any error (store down, model down mid-call) returns `null` so the
   * caller enqueues normally. Model-down specifically degrades to
   * exact-match-only — `checkSemantic()` fail-opens internally while
   * exact/content need no model.
   */
  private async findDuplicate(
    channelId: string,
    messageId: number,
    rawContent: string,
  ): Promise<{
    reason: string;
    channelId: string | null;
    messageId: number | null;
    entryId: string | null;
  } | null> {
    if (!this.dedupService) {
      return null;
    }
    try {
      const exact = await this.dedupService.checkExact(
        CRYPTO_NEWS_DEDUP_SOURCE,
        channelId,
        messageId,
      );
      if (exact.isDuplicate) {
        return this.toDuplicateRef(exact);
      }
      const content = await this.dedupService.checkContent(
        CRYPTO_NEWS_DEDUP_SOURCE,
        rawContent,
      );
      if (content.isDuplicate) {
        return this.toDuplicateRef(content);
      }
      const url = await this.dedupService.checkUrl(
        CRYPTO_NEWS_DEDUP_SOURCE,
        rawContent,
      );
      const semantic = await this.dedupService.checkSemantic(
        CRYPTO_NEWS_DEDUP_SOURCE,
        rawContent,
        channelId,
        messageId,
        url.urlOverlapCount ?? 0,
      );
      if (semantic.isDuplicate) {
        return this.toDuplicateRef(semantic);
      }
      return null;
    } catch (err) {
      this.logger.warn(
        `dedup check failed for ${channelId}:${messageId} — failing open to enqueue (${(err as Error).message})`,
      );
      return null;
    }
  }

  private toDuplicateRef(result: DedupResult): {
    reason: string;
    channelId: string | null;
    messageId: number | null;
    entryId: string | null;
  } {
    const record = result.existingRecord;
    return {
      reason: result.blockedReason ?? 'Duplicate of queue',
      channelId: record?.channelId ?? null,
      messageId: record?.messageId ?? null,
      entryId: record?.referencedEntryId ?? null,
    };
  }

  /**
   * Same-coords guard: the queue has a UNIQUE(channel_id, message_id)
   * constraint, so a BLOCKED row for already-tracked coordinates cannot
   * be inserted. Fail-open to `false` — the enqueue then surfaces any
   * real collision.
   */
  private async isAlreadyTracked(
    channelId: string,
    messageId: number,
  ): Promise<boolean> {
    try {
      const existing = await this.queueRepo.findByChannelIdAndMessageId(
        channelId,
        messageId,
      );
      return existing !== null;
    } catch {
      return false;
    }
  }
}
