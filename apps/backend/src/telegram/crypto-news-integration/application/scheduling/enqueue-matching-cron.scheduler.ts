import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { CronJob } from 'cron';
import { FilteredCryptoNewsService } from '../services/filtered-crypto-news.service';
import { EnqueueMatchingMessageUseCase } from '../../../crypto-news-publisher/application/handlers/enqueue-matching-message.use-case';
import type { CryptoNewsMessageDto } from '../../domain/dtos/crypto-news-message.dto';
import { MatchingConfigRepository } from '../ports/matching-config.repository';
import { MatchingHealthState } from '../state/matching-health.state';
import type {
  EnqueueMessageDto,
  EnqueueMessageMediaDto,
} from '../../../crypto-news-publisher/domain/dtos';

/**
 * EnqueueMatchingCronScheduler - Poll ingestion-telegram for matching crypto-news messages
 *
 * FALLBACK PATH: polling scheduler for crypto-news messages (catches SSE gaps).
 * The SSE handler is the PRIMARY PATH (<10s latency target); this poller runs
 * every 1 min when SSE is disabled (primary mode) or every N min
 * (CRYPTO_NEWS_POLLING_INTERVAL_MINUTES, default 5) when SSE is enabled.
 * See: docs/architecture/crypto-news-dual-path.md
 *
 * **Per Opción A architecture:**
 * - Ingestion-service stores RAW messages (no filters)
 * - Backend polls ingestion-telegram HTTP API every minute
 * - FilteredCryptoNewsService applies filters + keyword matching on-read
 * - Matched messages are enqueued for LLM processing + publication
 *
 * **Responsibilities:**
 * 1. Fetch recent messages from ingestion-telegram (last 50, configurable)
 * 2. Filter + match via FilteredCryptoNewsService (regex transforms + keywords)
 * 3. Enqueue matched messages via EnqueueMatchingMessageUseCase
 * 4. Log stats (fetched / filtered / enqueued counts)
 *
 * **Frequency:** Every minute (matches PublisherCronScheduler)
 *
 * **Race safety:**
 * - EnqueueMatchingMessageUseCase is idempotent by design (queue cap 36)
 * - Multiple backend replicas CAN poll concurrently (queue handles duplicates)
 * - No advisory lock needed (unlike PublisherCronScheduler which drains queue)
 *
 * **Enabled/Disabled:** Reads MatchingConfig.enabled (independent of LLM/publishing).
 * When disabled, no messages are enqueued (matching stops).
 *
 * @injectable NestJS scheduler
 */
@Injectable()
export class EnqueueMatchingCronScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(EnqueueMatchingCronScheduler.name);

  /**
   * Max messages to fetch per tick. Trade-off:
   * - Higher = more backlog catchup, more DB load
   * - Lower = less load, slower recovery after downtime
   *
   * Default 50 = ~1 message/sec ingestion rate.
   * Queue cap is 36 (EnqueueMatchingMessageUseCase.MAX_QUEUE_DEPTH),
   * so excess matches are naturally capped by the queue overflow logic.
   */
  private readonly FETCH_LIMIT = 50;

  /**
   * Guard against concurrent ticks (same pattern as PublisherCronScheduler).
   *
   * When true, a new tick is skipped with a warn log (see tick()).
   */
  private isPolling = false;

  /**
   * Consecutive full-batch counter for adaptive re-polling.
   *
   * A "full batch" is a tick where the fetch returns at least FETCH_LIMIT
   * matches (i.e. the backlog may exceed one window). After
   * ADAPTIVE_REPOLL_THRESHOLD consecutive full batches, one extra tick is
   * scheduled ADAPTIVE_REPOLL_DELAY_MS later to catch up faster; any
   * non-full batch (or fetch failure) resets the counter to 0.
   */
  private consecutiveFullBatches = 0;

  /**
   * Full batches in a row required before scheduling one adaptive re-poll.
   */
  private readonly ADAPTIVE_REPOLL_THRESHOLD = 3;

  /**
   * Delay for the single adaptive re-poll tick once the threshold is hit.
   */
  private readonly ADAPTIVE_REPOLL_DELAY_MS = 10_000;

  constructor(
    private readonly filteredNewsService: FilteredCryptoNewsService,
    private readonly enqueueUseCase: EnqueueMatchingMessageUseCase,
    private readonly matchingConfigRepo: MatchingConfigRepository,
    private readonly health: MatchingHealthState,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly configService: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Read configuration for dynamic cron interval
    const useSse = this.configService.get<boolean>(
      'app.ingestion.useSseCryptoNews',
      true,
    );
    const pollingInterval = this.configService.get<number>(
      'app.cryptoNews.pollingIntervalMinutes',
      5,
    );

    // Determine effective interval based on SSE mode
    // - SSE enabled: use configured polling interval (fallback mode)
    // - SSE disabled: use 1 minute (primary ingestion path)
    const intervalMinutes = useSse ? pollingInterval : 1;
    const cronExpression = `*/${intervalMinutes} * * * *`;

    // Register dynamic cron job
    const job = new CronJob(cronExpression, () => void this.tick());
    this.schedulerRegistry.addCronJob('crypto-news-polling', job);
    job.start();

    // Log readiness with all configuration details
    const sseMode = useSse ? 'enabled' : 'disabled';
    try {
      const cfg = await this.matchingConfigRepo.load();
      this.logger.log(
        `EnqueueMatchingCronScheduler ready (fetch limit: ${this.FETCH_LIMIT}, enabled: ${cfg.enabled}, interval: ${intervalMinutes}min, SSE: ${sseMode})`,
      );
    } catch {
      this.logger.warn(
        `EnqueueMatchingCronScheduler ready (fetch limit: ${this.FETCH_LIMIT}, enabled: unknown, interval: ${intervalMinutes}min, SSE: ${sseMode}) — could not load MatchingConfig; scheduler will retry on each tick`,
      );
    }
  }

  /**
   * Cron tick: fetch recent messages, filter, enqueue matches.
   *
   * NOTE: Scheduling is now dynamic (registered in onApplicationBootstrap).
   * Interval varies based on USE_SSE_CRYPTO_NEWS flag:
   * - SSE enabled: runs every N minutes (CRYPTO_NEWS_POLLING_INTERVAL_MINUTES, default 5) as fallback
   * - SSE disabled: runs every 1 minute as primary ingestion path
   *
   * Skips tick if previous tick still running (defensive guard).
   * Skips tick if matchingEnabled is false.
   */
  async tick(): Promise<void> {
    if (this.isPolling) {
      this.logger.warn('Previous tick still running; skipping this tick');
      return;
    }

    // Check if matching is enabled
    let enabled = false;
    try {
      const cfg = await this.matchingConfigRepo.load();
      enabled = cfg.enabled;
    } catch (err) {
      this.logger.error(
        `Failed to load MatchingConfig on tick: ${(err as Error).message} — skipping`,
      );
      return;
    }

    if (!enabled) {
      // Silent skip when disabled
      return;
    }

    this.isPolling = true;
    try {
      // Step 1: Fetch + filter + match via FilteredCryptoNewsService.
      // Pinned to type=crypto-news: the unified feed also carries KOL-typed
      // rows, which must never enter the crypto-news publisher queue.
      const matches = await this.filteredNewsService.getMatchingMessages(
        this.FETCH_LIMIT,
        undefined,
        'crypto-news',
      );
      this.health.recordFetchSuccess();

      // Adaptive polling accounting: a full window suggests backlog remains.
      if (matches.length >= this.FETCH_LIMIT) {
        this.consecutiveFullBatches += 1;
      } else {
        this.consecutiveFullBatches = 0;
      }

      if (matches.length === 0) {
        this.logger.debug(
          `No matching messages found (fetched up to ${this.FETCH_LIMIT})`,
        );
        return;
      }

      this.logger.log(
        `Found ${matches.length} matching messages, enqueuing...`,
      );

      // Step 2: Enqueue each matched message
      let enqueued = 0;
      let skipped = 0;

      for (const match of matches) {
        try {
          // Map FilteredCryptoNewsMessage DTO to EnqueueMessageDto
          // (EnqueueMatchingMessageUseCase now expects EnqueueMessageDto)
          const dto = this.mapToPublisherDto(match);

          const entry = await this.enqueueUseCase.execute({ message: dto });

          if (entry) {
            enqueued++;
          } else {
            skipped++;
          }
        } catch (error) {
          this.logger.error(
            `Failed to enqueue message ${match.channelId}:${match.messageId}: ${(error as Error).message}`,
          );
          skipped++;
        }
      }

      this.logger.log(
        `Enqueue batch complete: ${enqueued} enqueued, ${skipped} skipped (out of ${matches.length} matches)`,
      );
      if (enqueued > 0) {
        this.health.recordEnqueued();
      }

      // Sustained full batches: schedule one catch-up re-poll shortly after.
      if (this.consecutiveFullBatches >= this.ADAPTIVE_REPOLL_THRESHOLD) {
        this.consecutiveFullBatches = 0;
        this.logger.log(
          `Sustained full batches detected; scheduling catch-up re-poll in ${this.ADAPTIVE_REPOLL_DELAY_MS}ms`,
        );
        const timer = setTimeout(
          () => void this.tick(),
          this.ADAPTIVE_REPOLL_DELAY_MS,
        );
        // Don't hold the process open for a catch-up tick.
        const withUnref = timer as unknown as { unref?: () => void };
        if (typeof withUnref.unref === 'function') {
          withUnref.unref();
        }
      }
    } catch (error) {
      // The per-message enqueue errors are caught inside the loop above,
      // so reaching here means the fetch itself threw.
      this.consecutiveFullBatches = 0;
      this.health.recordFetchFailure();
      this.logger.error(
        `Enqueue tick failed: ${(error as Error).message}`,
        (error as Error).stack,
      );
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * Map FilteredCryptoNewsMessage DTO to EnqueueMessageDto (Publisher DTO).
   *
   * Strategy 1 (Pure DTO): Backend uses DTOs to decouple from ingestion-telegram
   * domain entities. This mapper converts from HTTP DTO shape to Publisher DTO shape.
   *
   * Transformations:
   * - ISO date strings → Date objects (publishedAt, ingestedAt)
   * - Embed matchedKeywords from FilteredCryptoNewsMessage
   * - Resolve media file paths for publisher consumption
   * - Map media type: 'webpage' → 'document' (ingestion service uses 'webpage', publisher uses 'document')
   *
   * This is a lightweight adapter — NO validation, NO business logic.
   * The DTO comes from FilteredCryptoNewsService (already filtered).
   */
  private mapToPublisherDto(
    dto: Awaited<
      ReturnType<typeof this.filteredNewsService.getMatchingMessages>
    >[number],
  ): EnqueueMessageDto {
    // Map media array (HTTP DTO shape → Publisher DTO shape).
    // ownerMessageId (set by album-merge) selects the sibling that owns
    // each file for path resolution; defaults to this message.
    const media: EnqueueMessageMediaDto[] = dto.media.map((m) => ({
      index: m.index,
      type: this.mapMediaType(m.type),
      filePath: this.resolveMediaFilePath(
        dto.channelId,
        m.ownerMessageId ?? dto.messageId,
        m,
      ),
      mimeType: m.mimeType ?? undefined,
      fileSize: m.fileSize ?? undefined,
    }));

    // Return Publisher DTO
    return {
      channelId: dto.channelId,
      messageId: dto.messageId,
      content: dto.content, // ← FILTERED content (already transformed by FilteredCryptoNewsService)
      publishedAt: new Date(dto.publishedAt), // ISO string → Date
      ingestedAt: new Date(dto.ingestedAt), // ISO string → Date
      media,
      groupedId: dto.groupedId ?? null,
      matchedKeywords: dto.matchedKeywords, // Embed matched keywords
    };
  }

  /**
   * Map media type from ingestion-telegram shape to publisher shape.
   *
   * Ingestion service uses 'webpage' for link previews.
   * Publisher expects 'document' for non-photo/video media.
   */
  private mapMediaType(
    type: 'photo' | 'video' | 'webpage',
  ): 'photo' | 'video' | 'document' {
    if (type === 'webpage') {
      return 'document';
    }
    return type;
  }

  /**
   * Resolve a publisher-consumable `filePath` for one DTO media item.
   *
   * Priority: (1) server-provided `filePath` when present (internal shapes);
   * (2) absolute HTTP(S) `url` as-is — `ensureLocalFiles` in
   * `ProcessNextQueuedArticleUseCase` downloads those directly; (3) otherwise
   * reconstruct the ingestion-style local path
   * `uploads/crypto-news/media/<channel>/<message>_<index>.<ext>` from the
   * item coordinates. Case (3) is the live HTTP-API shape (`url` is a
   * frontend-relative `/ingestion-api/media/...` path, unusable as-is): the
   * publisher's `downloadFileFromIngestion` fallback parses exactly that
   * local-path shape back into `GET /api/media/...` and downloads the bytes.
   * Reconstructing it here needs no new config (the scheduler owns no
   * ingestion baseUrl) and reuses the already-tested fallback chain.
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
    return `uploads/crypto-news/media/${channelId}/${messageId}_${m.index}.${EnqueueMatchingCronScheduler.extensionFor(m.mimeType)}`;
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
