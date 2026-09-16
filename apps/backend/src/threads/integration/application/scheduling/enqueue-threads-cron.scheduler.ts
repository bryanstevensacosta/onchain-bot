import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { FilteredThreadsService } from '../services/filtered-threads.service';
import { EnqueueThreadsMessageUseCase } from 'threads/publisher/application/handlers/enqueue-threads-message.use-case';
import type { EnqueueThreadsMessageDto } from 'threads/publisher/application/handlers/enqueue-threads-message.use-case';
import type { FilteredThreadsMessage } from '../services/filtered-threads.service';
import { ThreadsMatchingConfigRepository } from '../ports/threads-matching-config.repository';
import { ThreadsMatchingHealthState } from '../state/threads-matching-health.state';

/**
 * Read the SSE-mode flag WITHOUT touching AppConfig (zero dependency on
 * T3's `AppConfig.threads`, which mirrors these intervals for operators
 * only). Default `true` mirrors `app.ingestion.useSseCryptoNews`.
 */
function isSseEnabled(): boolean {
  return process.env.USE_SSE_CRYPTO_NEWS !== 'false';
}

/**
 * EnqueueThreadsCronScheduler - Poll ingestion-service for matching
 * threads messages.
 *
 * Threads-typed mirror of crypto `EnqueueMatchingCronScheduler`
 * (`telegram/crypto-news-integration/application/scheduling/enqueue-matching-cron.scheduler.ts`)
 * with one deliberate deviation: intervals are LITERAL cron expressions
 * (every-5-minutes SSE-fallback / every-1-minute primary)
 * instead of a dynamic SchedulerRegistry job reading
 * `app.ingestion.useSseCryptoNews` + `app.cryptoNews.pollingIntervalMinutes`
 * from AppConfig. Rationale: zero dependency on T3's config block;
 * `AppConfig.threads` (T3) mirrors these values for operators only.
 *
 * **Interval behavior:**
 * - SSE enabled (`USE_SSE_CRYPTO_NEWS` ≠ `false`, default): the 5-minute
 *   job ticks as FALLBACK (catches messages missed during SSE gaps);
 *   the 1-minute job returns immediately.
 * - SSE disabled (`USE_SSE_CRYPTO_NEWS=false`): the 1-minute job ticks as
 *   PRIMARY ingestion path; the 5-minute job returns immediately.
 *
 * **Pipeline** (same as ProcessThreadsMessageHandler):
 * 1. Check `ThreadsMatchingConfig.enabled` (skip if disabled)
 * 2. Fetch recent messages: `FilteredThreadsService.getMatchingMessages(limit=50)`
 * 3. For each match: `EnqueueThreadsMessageUseCase.execute()`
 * 4. Log batch stats (enqueued / skipped)
 *
 * **Deduplication**: delegates to `EnqueueThreadsMessageUseCase` (idempotent
 * by `(channelId, messageId)`, cap 100). No advisory lock needed (unlike the
 * publisher drain scheduler).
 *
 * **DAILY_CAP contract:** this scheduler enqueues only; the dailyCap default
 * 60 lives in T2's llm-config repo and is enforced at publish time — never
 * redefined here.
 */
@Injectable()
export class EnqueueThreadsCronScheduler {
  private readonly logger = new Logger(EnqueueThreadsCronScheduler.name);

  /**
   * Max messages to fetch per tick. Trade-off:
   * - Higher = more backlog catchup, more load
   * - Lower = less load, slower recovery after downtime
   *
   * Default 50 mirrors the crypto scheduler. Queue cap is 100
   * (EnqueueThreadsMessageUseCase.THREADS_MAX_QUEUE_DEPTH), so excess
   * matches are naturally capped by the queue overflow logic.
   */
  private readonly FETCH_LIMIT = 50;

  /** Guard against concurrent ticks (same pattern as crypto scheduler). */
  private running = false;

  constructor(
    private readonly filteredThreadsService: FilteredThreadsService,
    private readonly enqueueUseCase: EnqueueThreadsMessageUseCase,
    private readonly matchingConfigRepo: ThreadsMatchingConfigRepository,
    private readonly health: ThreadsMatchingHealthState,
  ) {}

  /**
   * SSE-fallback tick: every 5 minutes, active ONLY when SSE is enabled.
   * Catches messages missed during SSE disconnection gaps.
   */
  @Cron('*/5 * * * *', { name: 'threads-matching-poll-sse-fallback' })
  async tickSseFallback(): Promise<void> {
    if (!isSseEnabled()) {
      return;
    }
    await this.tick();
  }

  /**
   * Primary tick: every 1 minute, active ONLY when SSE is disabled.
   * Polling is the sole ingestion path in that mode.
   */
  @Cron('*/1 * * * *', { name: 'threads-matching-poll-primary' })
  async tickPrimary(): Promise<void> {
    if (isSseEnabled()) {
      return;
    }
    await this.tick();
  }

  /**
   * Cron tick core: fetch recent messages, filter, enqueue matches.
   *
   * Skips tick if previous tick still running (defensive guard).
   * Skips tick if matchingEnabled is false.
   */
  async tick(): Promise<void> {
    if (this.running) {
      this.logger.warn('Previous threads tick still running; skipping this tick');
      return;
    }

    // Check if matching is enabled
    let enabled = false;
    try {
      const cfg = await this.matchingConfigRepo.load();
      enabled = cfg.enabled;
    } catch (err) {
      this.logger.error(
        `Failed to load ThreadsMatchingConfig on tick: ${(err as Error).message} — skipping`,
      );
      return;
    }

    if (!enabled) {
      // Silent skip when disabled
      return;
    }

    this.running = true;
    try {
      // Step 1: Fetch + filter + match via FilteredThreadsService
      const matches = await this.filteredThreadsService.getMatchingMessages(
        this.FETCH_LIMIT,
      );
      this.health.recordFetchSuccess();

      if (matches.length === 0) {
        this.logger.debug(
          `No matching threads messages found (fetched up to ${this.FETCH_LIMIT})`,
        );
        return;
      }

      this.logger.log(
        `Found ${matches.length} matching threads messages, enqueuing...`,
      );

      // Step 2: Enqueue each matched message
      let enqueued = 0;
      let skipped = 0;

      for (const match of matches) {
        try {
          const dto = this.mapToEnqueueDto(match);
          const entry = await this.enqueueUseCase.execute({ message: dto });

          if (entry) {
            enqueued++;
          } else {
            skipped++;
          }
        } catch (error) {
          this.logger.error(
            `Failed to enqueue threads message ${match.channelId}:${match.messageId}: ${(error as Error).message}`,
          );
          skipped++;
        }
      }

      this.logger.log(
        `Threads enqueue batch complete: ${enqueued} enqueued, ${skipped} skipped (out of ${matches.length} matches)`,
      );
      if (enqueued > 0) {
        this.health.recordEnqueued();
      }
    } catch (error) {
      // Per-message enqueue errors are caught inside the loop above,
      // so reaching here means the fetch itself threw.
      this.health.recordFetchFailure();
      this.logger.error(
        `Threads enqueue tick failed: ${(error as Error).message}`,
        (error as Error).stack,
      );
    } finally {
      this.running = false;
    }
  }

  /**
   * Map FilteredThreadsMessage → EnqueueThreadsMessageDto.
   *
   * Lightweight adapter — NO validation, NO business logic.
   * Transformations:
   * - ISO date strings → Date objects (publishedAt, ingestedAt)
   * - Embed matchedKeywords from FilteredThreadsMessage
   * - Map media type: 'webpage' → 'document' (threads queue has no webpage)
   * - Resolve media file paths for publisher consumption
   */
  private mapToEnqueueDto(match: FilteredThreadsMessage): EnqueueThreadsMessageDto {
    return {
      channelId: match.channelId,
      messageId: match.messageId,
      content: match.content, // ← FILTERED content
      publishedAt: new Date(match.publishedAt), // ISO string → Date
      ingestedAt: new Date(match.ingestedAt), // ISO string → Date
      media: match.media.map((m) => ({
        index: m.index,
        type: m.type === 'webpage' ? 'document' : m.type,
        filePath: this.resolveMediaFilePath(
          match.channelId,
          m.ownerMessageId ?? match.messageId,
          m,
        ),
      })),
      groupedId: match.groupedId ?? null,
      matchedKeywords: match.matchedKeywords,
    };
  }

  /**
   * Resolve a publisher-consumable `filePath` for one DTO media item.
   *
   * Mirror of the crypto scheduler's resolver (media is owned by the SAME
   * ingestion-service, so the local-path shape is identical):
   * (1) server-provided `filePath` when present; (2) absolute HTTP(S) `url`
   * as-is; (3) otherwise reconstruct the ingestion-style local path
   * `uploads/crypto-news/media/<channel>/<message>_<index>.<ext>`.
   */
  private resolveMediaFilePath(
    channelId: string,
    messageId: number,
    m: {
      filePath?: string;
      url?: string;
      index: number;
      mimeType: string | null;
    },
  ): string {
    if (m.filePath && m.filePath.trim().length > 0) {
      return m.filePath;
    }
    if (m.url && /^https?:\/\//.test(m.url)) {
      return m.url;
    }
    return `uploads/crypto-news/media/${channelId}/${messageId}_${m.index}.${EnqueueThreadsCronScheduler.extensionFor(m.mimeType)}`;
  }

  private static extensionFor(mimeType: string | null): string {
    switch ((mimeType ?? '').toLowerCase()) {
      case 'image/jpeg':
        return 'jpg';
      case 'image/png':
        return 'png';
      case 'image/gif':
        return 'gif';
      case 'image/webp':
        return 'webp';
      case 'video/mp4':
        return 'mp4';
      case 'video/quicktime':
        return 'mov';
      default:
        return 'bin';
    }
  }
}
