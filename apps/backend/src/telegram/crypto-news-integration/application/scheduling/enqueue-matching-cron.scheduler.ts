import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FilteredCryptoNewsService } from 'telegram/crypto-news-integration/application/services/filtered-crypto-news.service';
import { EnqueueMatchingMessageUseCase } from 'telegram/crypto-news-publisher/application/handlers/enqueue-matching-message.use-case';
import { CryptoNewsMessage } from 'telegram/ingestion/crypto-news/domain/entities/crypto-news-message.entity';
import { CryptoNewsMedia } from 'telegram/ingestion/crypto-news/domain/value-objects/crypto-news-media.vo';
import { LlmConfigRepository } from 'telegram/crypto-news-publisher/application/ports/llm-config.repository';

/**
 * EnqueueMatchingCronScheduler - Poll ingestion-service for matching crypto-news messages
 *
 * **Per Opción A architecture:**
 * - Ingestion-service stores RAW messages (no filters)
 * - Backend polls ingestion-service HTTP API every minute
 * - FilteredCryptoNewsService applies filters + keyword matching on-read
 * - Matched messages are enqueued for LLM processing + publication
 *
 * **Responsibilities:**
 * 1. Fetch recent messages from ingestion-service (last 50, configurable)
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
 * **Enabled/Disabled:** Reads LlmConfig.enabled (shared with PublisherCronScheduler).
 * When disabled, both matching AND publishing stop (no point enqueuing if not publishing).
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
   */
  private running = false;

  constructor(
    private readonly filteredNewsService: FilteredCryptoNewsService,
    private readonly enqueueUseCase: EnqueueMatchingMessageUseCase,
    private readonly llmConfigRepo: LlmConfigRepository,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const cfg = await this.llmConfigRepo.load();
      this.logger.log(
        `EnqueueMatchingCronScheduler ready (fetch limit: ${this.FETCH_LIMIT}, enabled: ${cfg.enabled})`,
      );
    } catch {
      this.logger.warn(
        'EnqueueMatchingCronScheduler ready — could not load LlmConfig; scheduler will retry on each tick',
      );
    }
  }

  /**
   * Cron tick: fetch recent messages, filter, enqueue matches.
   *
   * Runs every minute at the start of the minute.
   * Skips tick if previous tick still running (defensive guard).
   * Skips tick if LlmConfig.enabled is false (no point enqueuing if publishing is disabled).
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    if (this.running) {
      this.logger.warn('Previous tick still running; skipping this tick');
      return;
    }

    // Check if matching+publishing is enabled
    let enabled = false;
    try {
      const cfg = await this.llmConfigRepo.load();
      enabled = cfg.enabled;
    } catch (err) {
      this.logger.error(
        `Failed to load LlmConfig on tick: ${(err as Error).message} — skipping`,
      );
      return;
    }

    if (!enabled) {
      // Silent skip when disabled (same behavior as PublisherCronScheduler)
      return;
    }

    this.running = true;
    try {
      // Step 1: Fetch + filter + match via FilteredCryptoNewsService
      const matches = await this.filteredNewsService.getMatchingMessages(
        this.FETCH_LIMIT,
      );

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
          // Map FilteredCryptoNewsMessage DTO to CryptoNewsMessage domain entity
          // (EnqueueMatchingMessageUseCase expects domain entity)
          const message = this.mapToEntity(match);

          const entry = await this.enqueueUseCase.execute({
            message,
            matchedKeywords: match.matchedKeywords,
          });

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
    } catch (error) {
      this.logger.error(
        `Enqueue tick failed: ${(error as Error).message}`,
        (error as Error).stack,
      );
    } finally {
      this.running = false;
    }
  }

  /**
   * Map FilteredCryptoNewsMessage DTO to CryptoNewsMessage domain entity.
   *
   * EnqueueMatchingMessageUseCase expects a domain entity with specific
   * shape (content, media[], groupedId, formattingEntities).
   *
   * This is a lightweight adapter — NO validation, NO business logic.
   * The DTO comes from ingestion-service (already validated).
   */
  private mapToEntity(
    dto: Awaited<
      ReturnType<typeof this.filteredNewsService.getMatchingMessages>
    >[number],
  ): CryptoNewsMessage {
    // Parse messageEntities JSON string (Telegram formatting)
    const formattingEntities = dto.messageEntities ? dto.messageEntities : null;

    // Map media array (DTO shape → CryptoNewsMedia value object)
    const media = dto.media.map((m) =>
      CryptoNewsMedia.create({
        index: m.index,
        type: m.type,
        filePath: m.filePath,
        mimeType: m.mimeType,
        fileSize: m.fileSize,
      }),
    );

    // Construct domain entity (CryptoNewsMessage.create expects input object)
    return CryptoNewsMessage.create({
      channelId: dto.channelId,
      messageId: dto.messageId,
      title: dto.title,
      content: dto.content, // ← FILTERED content (already transformed by FilteredCryptoNewsService)
      publishedAt: new Date(dto.publishedAt),
      ingestedAt: new Date(dto.ingestedAt),
      linkPreviewUrl: dto.linkPreviewUrl,
      linkPreviewTitle: dto.linkPreviewTitle,
      linkPreviewDescription: dto.linkPreviewDescription,
      linkPreviewSiteName: dto.linkPreviewSiteName,
      groupedId: dto.groupedId,
      media,
      formattingEntities,
    });
  }
}
