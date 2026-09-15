import { Injectable, Logger } from '@nestjs/common';
import { isBlockingFailureReason } from 'shared/deduplication/domain/constants/blocking-failure-reasons';
import { ThreadsQueueEntry } from 'threads/publisher/domain/entities/threads-queue-entry.entity';
import type { ThreadsKeyword } from 'threads/publisher/domain/entities/threads-keyword.entity';
import { ThreadsQueueRepository } from 'threads/publisher/application/ports/threads-queue.repository';

/**
 * Media attachment carried on an enqueue request (resolved file path,
 * not a URL — same shape as the crypto-news `EnqueueMessageMediaDto`).
 */
export interface EnqueueThreadsMessageMedia {
  readonly index: number;
  readonly type: 'photo' | 'video' | 'document';
  readonly filePath: string;
}

/**
 * A matched message ready for the Threads queue. Produced by the
 * integration BC (fetch + filter + match); the queue stores it RAW —
 * length is NEVER a rejection reason here (the 500-char truncate is a
 * T3 pre-publish guard in the adapter, never an enqueue gate).
 */
export interface EnqueueThreadsMessageDto {
  readonly channelId: string;
  readonly messageId: number;
  readonly content: string;
  readonly publishedAt: Date;
  readonly ingestedAt: Date;
  readonly media: EnqueueThreadsMessageMedia[];
  readonly groupedId: string | null;
  readonly matchedKeywords: ThreadsKeyword[];
}

export interface EnqueueThreadsMessageInput {
  readonly message: EnqueueThreadsMessageDto;
}

/**
 * Use case: enqueue a matched message for publication to Threads.
 *
 * Clone of `EnqueueMatchingMessageUseCase` (crypto-news), Threads-typed:
 * - Idempotent by the `(channelId, messageId)` unique constraint. A
 *   pre-insert `findByChannelIdAndMessageId` check skips duplicates:
 *   PENDING/PUBLISHED always skip; FAILED skips only when the reason
 *   is content-blocking per the shared `isBlockingFailureReason()`
 *   helper (transient failures — Expired, rate-limit, not-configured —
 *   are re-enqueueable).
 * - The queue never holds more than `THREADS_MAX_QUEUE_DEPTH` (100)
 *   entries. The repo enforces it with INSERT + oldest-first overflow
 *   DELETE in a single transaction (mirror of the crypto-news 36-cap).
 * - NEVER rejects by text length — the queue stores raw content of any
 *   size (600+ chars enqueue fine).
 */
@Injectable()
export class EnqueueThreadsMessageUseCase {
  /**
   * Maximum queue depth kept by the overflow DELETE. Must match the
   * value used by the TypeORM threads queue repository (single source
   * of truth lives in the repo; this constant is here only for the
   * spec's overflow assertion).
   */
  public static readonly THREADS_MAX_QUEUE_DEPTH = 100;

  private readonly logger = new Logger(EnqueueThreadsMessageUseCase.name);

  public constructor(private readonly queueRepo: ThreadsQueueRepository) {}

  /**
   * Enqueue a single matched message.
   *
   * Returns the freshly-built `ThreadsQueueEntry`, the EXISTING entry
   * when the message is a dedup skip, or `null` when the matched
   * keyword requires an image but the message has no photo media.
   * Throws when the message carries no usable channelId.
   */
  public async execute(
    input: EnqueueThreadsMessageInput,
  ): Promise<ThreadsQueueEntry | null> {
    const message = input.message;
    if (!message.channelId?.trim()) {
      throw new Error('EnqueueThreadsMessageUseCase: missing channelId');
    }

    const duplicate = await this.queueRepo.findByChannelIdAndMessageId(
      message.channelId,
      message.messageId,
    );
    if (duplicate !== null) {
      if (
        duplicate.status === 'PENDING' ||
        duplicate.status === 'PUBLISHED'
      ) {
        this.logger.debug(
          `message ${message.channelId}:${message.messageId} already ${duplicate.status} — skipping`,
        );
        return duplicate;
      }
      if (
        duplicate.status === 'FAILED' &&
        isBlockingFailureReason(duplicate.lastError)
      ) {
        this.logger.debug(
          `message ${message.channelId}:${message.messageId} FAILED with blocking reason — skipping`,
        );
        return duplicate;
      }
      // FAILED with a transient reason (Expired, rate-limit, …): fall
      // through and re-enqueue a fresh entry. The unique constraint is
      // per-row, so drop the stale row first.
      await this.queueRepo.delete(duplicate.id);
    }

    const matchedKeywords = message.matchedKeywords ?? [];
    const firstKeyword = matchedKeywords[0];
    if (
      firstKeyword &&
      firstKeyword.requireMedia &&
      message.media.every((m) => m.type === 'document' || m.type === 'video')
    ) {
      this.logger.debug(
        `keyword ${firstKeyword.phrase} requires image; message ${message.messageId} has no photo media — skipping`,
      );
      return null;
    }

    const imagePaths = message.media.map((m) => m.filePath);
    const entry = ThreadsQueueEntry.create({
      channelId: message.channelId,
      messageId: message.messageId,
      rawContent: message.content,
      rawTitle: null,
      imagePath: imagePaths.length > 0 ? imagePaths[0] : null,
      imagePaths,
      groupedId: message.groupedId ?? null,
      messageReceivedAt: new Date(),
      matchedKeywordIds: matchedKeywords.map((k) => k.id),
      keywordTemplateId: firstKeyword?.templateId ?? null,
      formattingEntities: null,
    });

    await this.queueRepo.enqueue(entry);
    return entry;
  }
}
