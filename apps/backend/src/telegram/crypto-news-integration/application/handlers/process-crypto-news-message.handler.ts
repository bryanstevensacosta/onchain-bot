import { Injectable, Logger, Optional } from '@nestjs/common';
import { TelegramRawMessage } from 'telegram/ingestion/shared/domain/ports/telegram-listener.port';
import { FilteredCryptoNewsService } from '../services/filtered-crypto-news.service';
import { EnqueueMatchingMessageUseCase } from '../../../crypto-news-publisher/application/handlers/enqueue-matching-message.use-case';
import { MatchingConfigRepository } from '../ports/matching-config.repository';
import { PublisherQueueRepository } from '../../../crypto-news-publisher/application/ports/publisher-queue.repository';
import { DeadLetterService } from '../services/dead-letter.service';
import { isBlockingFailureReason } from 'shared/deduplication/domain/constants/blocking-failure-reasons';

/**
 * ProcessCryptoNewsMessageHandler - Handle real-time SSE crypto-news events
 *
 * PRIMARY PATH: real-time SSE ingestion for crypto-news messages (<10s latency target).
 * This handler processes one SSE event at a time; the polling scheduler is the
 * FALLBACK PATH that catches gaps. See: docs/architecture/crypto-news-dual-path.md
 *
 * **Responsibilities:**
 * 1. Check matchingEnabled flag (skip if disabled)
 * 2. Check PublisherQueueEntry deduplication (skip if already queued/published)
 * 3. Fetch RAW message from ingestion-telegram (via FilteredCryptoNewsService)
 * 4. Apply ContentFilterService + keyword matching
 * 5. Enqueue if matched (via EnqueueMatchingMessageUseCase)
 * 6. Log latency (Date.now() - ingestedAt)
 *
 * **Error handling:**
 * - Defensive error boundary (catch, log, don't throw)
 * - Prevents single bad message from crashing SSE stream
 * - Fallback polling will retry transient failures
 *
 * **Deduplication strategy:**
 * - Checks PublisherQueueEntry status BEFORE expensive filter/match operations
 * - SKIP if status=PENDING (already in queue)
 * - SKIP if status=PUBLISHED (already published)
 * - SKIP if status=FAILED with blocking reason (content-related issues)
 * - ALLOW if status=FAILED with non-blocking reason (transient failures)
 *
 * **Latency measurement:**
 * - Calculates Date.now() - ingestedAt after successful enqueue
 * - Logs INFO if <10s (target met)
 * - Logs WARN if ≥10s (target missed)
 *
 * **Per Opción A architecture:**
 * - Ingestion-service stores RAW content (no filters)
 * - Backend applies filters on-read (ContentFilterService + keywords)
 * - Frontend reads RAW content directly (display mode)
 * - Publisher queue receives FILTERED content
 *
 * @injectable NestJS service
 */
@Injectable()
export class ProcessCryptoNewsMessageHandler {
  private readonly logger = new Logger(ProcessCryptoNewsMessageHandler.name);

  constructor(
    private readonly filteredNewsService: FilteredCryptoNewsService,
    private readonly enqueueUseCase: EnqueueMatchingMessageUseCase,
    private readonly matchingConfigRepo: MatchingConfigRepository,
    private readonly queueRepo: PublisherQueueRepository,
    @Optional() private readonly deadLetters?: DeadLetterService,
  ) {}

  /**
   * Process a single crypto-news message from SSE stream.
   *
   * Pipeline:
   * 1. Check matchingEnabled flag (skip if disabled)
   * 2. Check PublisherQueueEntry deduplication (skip if already queued/published)
   * 3. Fetch RAW message from ingestion-telegram (via FilteredCryptoNewsService)
   * 4. Apply ContentFilterService + keyword matching
   * 5. Enqueue if matched (via EnqueueMatchingMessageUseCase)
   * 6. Log latency (Date.now() - ingestedAt)
   *
   * @param raw - TelegramRawMessage from SSE stream (messageType='crypto-news')
   * @returns void (errors logged, not thrown)
   */
  async handle(raw: TelegramRawMessage): Promise<void> {
    try {
      // Step 1: Check matchingEnabled flag
      const config = await this.matchingConfigRepo.load();
      if (!config?.enabled) {
        this.logger.debug(
          `Matching disabled, skipping ${raw.peerId}:${raw.messageId}`,
        );
        return;
      }

      // Step 2: Check deduplication BEFORE expensive filter/match operations
      const channelId = raw.peerId;
      const messageId = raw.messageId;
      const existing = await this.queueRepo.findByChannelIdAndMessageId(
        channelId,
        messageId,
      );

      if (existing) {
        const status = existing.status;

        // Always skip if PENDING or PUBLISHED
        if (status === 'PENDING' || status === 'PUBLISHED') {
          this.logger.debug(
            `Message ${channelId}:${messageId} already ${status}, skipping`,
          );
          return;
        }

        // For FAILED status, check if failure reason is blocking
        if (status === 'FAILED') {
          const reason = existing.lastError;
          if (isBlockingFailureReason(reason)) {
            this.logger.debug(
              `Message ${channelId}:${messageId} has blocking failure (${reason}), skipping`,
            );
            return;
          }
          // Non-blocking failure (transient) — allow re-enqueue
          this.logger.debug(
            `Message ${channelId}:${messageId} has non-blocking failure (${reason}), allowing re-enqueue`,
          );
        }
      }

      // Step 3: Fetch + filter + match via FilteredCryptoNewsService.
      // Window of 10 (not 1): album siblings arrive together and the merge
      // inside getMatchingMessages needs them co-present to attach all
      // photos to one entry. Pinned to type=crypto-news: KOL-typed rows
      // sharing the unified feed must never enter the publisher queue.
      const matchedMessages =
        await this.filteredNewsService.getMatchingMessages(
          10,
          channelId,
          'crypto-news',
        );

      // Select THIS event's entry (never [0]-assumed: the window may hold
      // other recent matches, and each event enqueues only its own).
      const matched = matchedMessages.find(
        (m) => m.channelId === channelId && m.messageId === messageId,
      );

      if (!matched) {
        this.logger.debug(
          `No keyword match for ${channelId}:${messageId}, skipping`,
        );
        return;
      }

      // Step 4: Enqueue if matched
      const enqueued = await this.enqueueUseCase.execute({
        message: {
          channelId: matched.channelId,
          messageId: matched.messageId,
          content: matched.content, // FILTERED content
          publishedAt: new Date(matched.publishedAt),
          ingestedAt: new Date(matched.ingestedAt),
          media: matched.media.map((m) => ({
            index: m.index,
            type: m.type === 'webpage' ? 'photo' : m.type,
            filePath: m.filePath || m.url || '',
            mimeType: m.mimeType || undefined,
            fileSize: m.fileSize || undefined,
          })),
          groupedId: matched.groupedId ?? null,
          matchedKeywords: matched.matchedKeywords,
        },
      });

      if (enqueued) {
        this.logger.log(
          `✅ Enqueued ${channelId}:${messageId} via SSE (id: ${enqueued.id})`,
        );

        // Step 5: Log latency
        this.logLatency(new Date(matched.ingestedAt), channelId, messageId);
      }
    } catch (error) {
      this.logger.error(
        `Failed to process crypto-news message ${raw.peerId}:${raw.messageId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
      // Do NOT throw — prevents single bad message from crashing SSE stream
      try {
        await this.deadLetters?.capture({
          channelId: raw.peerId,
          messageId: raw.messageId,
          failureReason: error instanceof Error ? error.message : String(error),
          failedPayload: {
            peerId: raw.peerId,
            messageId: raw.messageId,
            text: raw.text ?? null,
            messageType: raw.messageType ?? null,
            occurredAt:
              raw.occurredAt instanceof Date
                ? raw.occurredAt.toISOString()
                : String(raw.occurredAt ?? ''),
          },
        });
      } catch {
        // Swallowed by design — a DLQ outage must never break the SSE stream.
      }
    }
  }

  /**
   * Calculate and log ingestion latency.
   *
   * Latency = Date.now() - ingestedAt (time from ingestion-telegram storage to backend enqueue)
   *
   * Logs INFO if <10s (target met)
   * Logs WARN if ≥10s (target missed)
   *
   * @param ingestedAt - Timestamp from ingestion-telegram (when message was stored)
   * @param channelId - For log correlation
   * @param messageId - For log correlation
   * @returns void (logs INFO or WARN)
   */
  private logLatency(
    ingestedAt: Date,
    channelId: string,
    messageId: number,
  ): void {
    try {
      if (
        !ingestedAt ||
        !(ingestedAt instanceof Date) ||
        isNaN(ingestedAt.getTime())
      ) {
        this.logger.warn(
          `Invalid ingestedAt for ${channelId}:${messageId}: ${String(ingestedAt)} — skipping latency log`,
        );
        return;
      }

      const latencyMs = Date.now() - ingestedAt.getTime();
      const latencySec = (latencyMs / 1000).toFixed(2);

      if (latencyMs < 10_000) {
        this.logger.log(
          `✅ Latency ${latencySec}s for ${channelId}:${messageId} (target <10s met)`,
        );
      } else {
        this.logger.warn(
          `⚠️ Latency ${latencySec}s for ${channelId}:${messageId} (target <10s MISSED)`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to calculate latency for ${channelId}:${messageId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      // Non-critical — continue without latency log
    }
  }
}
