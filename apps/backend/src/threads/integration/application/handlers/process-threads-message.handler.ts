import { Injectable, Logger } from '@nestjs/common';
// READ-ONLY type import from the SSE transport: the `kol | crypto-news`
// union is consumed as-is (no new 'threads' member, no coordinator branch,
// no EVENT_MAP entry — threads reuses `messageType='crypto-news'` events
// with zero ingestion-service / telegram changes).
import type { TelegramRawMessage } from 'telegram/ingestion/shared/domain/ports/telegram-listener.port';
import { FilteredThreadsService } from '../services/filtered-threads.service';
import { EnqueueThreadsMessageUseCase } from 'threads/publisher/application/handlers/enqueue-threads-message.use-case';
import { ThreadsMatchingConfigRepository } from '../ports/threads-matching-config.repository';
import { ThreadsQueueRepository } from 'threads/publisher/application/ports/threads-queue.repository';
import { isBlockingFailureReason } from 'shared/deduplication/domain/constants/blocking-failure-reasons';

/**
 * ProcessThreadsMessageHandler - Handle real-time SSE crypto-news events
 * for the threads pipeline.
 *
 * Threads-typed mirror of crypto `ProcessCryptoNewsMessageHandler`
 * (`telegram/crypto-news-integration/application/handlers/process-crypto-news-message.handler.ts`):
 *
 * **Responsibilities:**
 * 1. Ignore non-crypto-news SSE events (`messageType='kol'` → skip)
 * 2. Check matchingEnabled flag (skip if disabled)
 * 3. Check ThreadsQueueEntry deduplication (skip if already queued/published)
 * 4. Fetch RAW message from ingestion-service (via FilteredThreadsService)
 * 5. Apply ContentFilterService + threads keyword matching
 * 6. Enqueue if matched (via EnqueueThreadsMessageUseCase from T2)
 * 7. Log latency (Date.now() - ingestedAt)
 *
 * **Error handling:**
 * - Defensive error boundary (catch, log, don't throw)
 * - Prevents single bad message from crashing SSE stream
 * - Fallback polling will retry transient failures
 *
 * **Deduplication strategy:**
 * - Checks ThreadsQueueEntry status BEFORE expensive filter/match operations
 * - SKIP if status=PENDING (already in queue)
 * - SKIP if status=PUBLISHED (already published)
 * - SKIP if status=FAILED with blocking reason (content-related issues)
 * - ALLOW if status=FAILED with non-blocking reason (transient failures)
 *
 * **DAILY_CAP contract:** this handler enqueues only; the dailyCap default
 * 60 lives in T2's llm-config repo and is enforced at publish time (T2's
 * `ProcessNextThreadsArticleUseCase`) — never redefined here.
 */
@Injectable()
export class ProcessThreadsMessageHandler {
  private readonly logger = new Logger(ProcessThreadsMessageHandler.name);

  constructor(
    private readonly filteredThreadsService: FilteredThreadsService,
    private readonly enqueueUseCase: EnqueueThreadsMessageUseCase,
    private readonly matchingConfigRepo: ThreadsMatchingConfigRepository,
    private readonly queueRepo: ThreadsQueueRepository,
  ) {}

  /**
   * Process a single SSE message for the threads pipeline.
   *
   * Only `messageType='crypto-news'` events are processed (reused as-is —
   * zero ingestion-service changes); `messageType='kol'` (and anything
   * else) is ignored.
   *
   * @param raw - TelegramRawMessage from SSE stream
   * @returns void (errors logged, not thrown)
   */
  async handle(raw: TelegramRawMessage): Promise<void> {
    try {
      // Step 0: Ignore non-crypto-news SSE events
      if (raw.messageType !== 'crypto-news') {
        this.logger.debug(
          `Ignoring SSE event with messageType='${raw.messageType ?? 'undefined'}' (${raw.peerId}:${raw.messageId})`,
        );
        return;
      }

      // Step 1: Check matchingEnabled flag
      const config = await this.matchingConfigRepo.load();
      if (!config?.enabled) {
        this.logger.debug(
          `Threads matching disabled, skipping ${raw.peerId}:${raw.messageId}`,
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

      // Step 3: Fetch + filter + match via FilteredThreadsService.
      // Window of 10 (not 1): album siblings arrive together and the merge
      // inside getMatchingMessages needs them co-present to attach all
      // photos to one entry.
      const matchedMessages =
        await this.filteredThreadsService.getMatchingMessages(10, channelId);

      // Select THIS event's entry (never [0]-assumed: the window may hold
      // other recent matches, and each event enqueues only its own).
      const matched = matchedMessages.find(
        (m) => m.channelId === channelId && m.messageId === messageId,
      );

      if (!matched) {
        this.logger.debug(
          `No threads keyword match for ${channelId}:${messageId}, skipping`,
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
            type: m.type === 'webpage' ? 'document' : m.type,
            filePath: m.filePath ?? m.url ?? '',
          })),
          groupedId: matched.groupedId ?? null,
          matchedKeywords: matched.matchedKeywords,
        },
      });

      if (enqueued) {
        this.logger.log(
          `✅ Enqueued ${channelId}:${messageId} for threads via SSE (id: ${enqueued.id})`,
        );

        // Step 5: Log latency
        this.logLatency(new Date(matched.ingestedAt), channelId, messageId);
      }
    } catch (error) {
      this.logger.error(
        `Failed to process threads message ${raw.peerId}:${raw.messageId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
      // Do NOT throw — prevents single bad message from crashing SSE stream
    }
  }

  /**
   * Calculate and log ingestion latency.
   *
   * Latency = Date.now() - ingestedAt (time from ingestion-service storage to backend enqueue)
   *
   * Logs INFO if <10s (target met)
   * Logs WARN if ≥10s (target missed)
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
          `✅ Threads latency ${latencySec}s for ${channelId}:${messageId} (target <10s met)`,
        );
      } else {
        this.logger.warn(
          `⚠️ Threads latency ${latencySec}s for ${channelId}:${messageId} (target <10s MISSED)`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to calculate threads latency for ${channelId}:${messageId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      // Non-critical — continue without latency log
    }
  }
}
