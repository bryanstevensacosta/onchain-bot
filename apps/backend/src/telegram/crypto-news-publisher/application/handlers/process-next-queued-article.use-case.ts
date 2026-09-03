import { Injectable, Logger } from '@nestjs/common';
import { PublisherQueueRepository } from 'telegram/crypto-news-publisher/application/ports/publisher-queue.repository';
import { SharedThrottleStateRepository } from 'telegram/shared/application/ports/shared-throttle-state.repository';
import { LlmConfigRepository } from 'telegram/crypto-news-publisher/application/ports/llm-config.repository';
import { LlmConfig } from 'telegram/crypto-news-publisher/domain/entities/llm-config.entity';
import { SharedThrottleSchedulerService } from 'telegram/shared/application/services/shared-throttle-scheduler.service';
import { findNonLatinCharacter } from 'telegram/crypto-news-publisher/application/services/latin-script-validator';
import { PublisherQueueEntry } from 'telegram/crypto-news-publisher/domain/entities/publisher-queue-entry.entity';
import { TelegramPublisherPort } from 'telegram/shared';
import { CryptoNewsLlmAdapter } from 'telegram/crypto-news-publisher/infrastructure/llm/crypto-news-llm.adapter';
import { SlotArbitratorPort } from 'telegram/shared/domain/ports/slot-arbitrator.port';
import { AdRotationStateRepository } from 'telegram/crypto-news-ads/application/ports/ad-rotation-state.repository';
import { MediaCleanupService } from 'telegram/crypto-news-publisher/infrastructure/services/media-cleanup.service';
import { CryptoNewsPublisherConfigService } from 'telegram/crypto-news-publisher/infrastructure/config/crypto-news-publisher.config';
import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * Orchestrator use case: drain one PENDING entry from the publisher
 * queue end-to-end.
 *
 * Order of operations (mirrors plan §T5 of
 * `.omo/plans/crypto-news-publisher.md`):
 *
 *   1. Daily-cap check — if `dailyCap`+ PUBLISHED rows already exist
 *      in the current UTC window, return without touching anything.
 *   2. Throttle check — the random-delay window is honoured; if the
 *      cron ticked too soon after the previous publish, return.
 *   3. Queue dequeue — oldest PENDING entry. If none, return.
 *   4. LLM refinement — call the crypto-news adapter to rewrite the
 *      text. The adapter is the only place that touches the local
 *      image file (reads + base64-encodes for the LLM).
 *   5. Publish — try `sendPhoto` first (entry has a local image);
 *      fall back to `sendMessage` when the entry has no image.
 *   6. On success: mark the entry PUBLISHED, persist the new
 *      `lastPublishAt` so the next tick honours the random delay.
 *   7. On failure: increment attempts (re-queue) up to
 *      `llmMaxAttempts`; past that, mark FAILED.
 *
 * All publishing knobs are read from `LlmConfigRepository.load()` at
 * the top of `execute()` — Wave 2 removes the JSON-config dependency
 * (the Wave 1 migration seeded `LlmConfig`; the JSON file is kept on
 * disk only for backwards compatibility / migration and will be
 * deleted in Wave 3).
 *
 * The use case is fail-safe: every step is wrapped so a thrown error
 * does not crash the cron tick — the error is logged and the entry's
 * state is updated accordingly. The cron scheduler treats this
 * method as a "best-effort, single entry per tick" boundary.
 */
@Injectable()
export class ProcessNextQueuedArticleUseCase {
  private readonly logger = new Logger(ProcessNextQueuedArticleUseCase.name);

  public constructor(
    private readonly queueRepo: PublisherQueueRepository,
    private readonly throttleScheduler: SharedThrottleSchedulerService,
    private readonly llmAdapter: CryptoNewsLlmAdapter,
    private readonly publisher: TelegramPublisherPort,
    private readonly throttleStateRepo: SharedThrottleStateRepository,
    private readonly llmConfigRepo: LlmConfigRepository,
    private readonly slotArbitrator: SlotArbitratorPort,
    private readonly rotationStateRepo: AdRotationStateRepository,
    private readonly mediaCleanup: MediaCleanupService,
    private readonly publisherConfig: CryptoNewsPublisherConfigService,
  ) {}

  /**
   * Drain one entry. Always returns `void` — the only observable
   * effects are (a) the entry's persisted state, (b) the throttle
   * state's `lastPublishAt`, (c) the slot state (news publish timestamp),
   * (d) the ads rotation counter, and (e) a Telegram message.
   */
  public async execute(): Promise<void> {
    const cfg = await this.llmConfigRepo.load();

    const now = new Date();
    const slot = await this.slotArbitrator.canPublishNow('news', now);
    if (!slot.canPublish) {
      this.logger.log(
        `slot held by '${slot.lastScope ?? 'unknown'}' — next slot in ` +
          `${slot.remainingSeconds}s`,
      );
      return;
    }

    if (!(await this.canPublishToday(cfg))) {
      this.logger.log('daily cap reached — skipping tick');
      return;
    }
    const decision = await this.throttleScheduler.shouldPublish(now);
    if (!decision.canPublish) {
      this.logger.log(
        `throttle active — next publish in ${decision.nextDelayMs}ms`,
      );
      return;
    }
    const entry = await this.queueRepo.findNextPending();
    if (entry === null) {
      this.logger.log('no pending entries — skipping tick');
      return;
    }

    try {
      const generated = await this.llmAdapter.generateForEntry(entry);
      if (cfg.rejectNonLatin) {
        const bad = findNonLatinCharacter(generated.content);
        if (bad) {
          const code = bad.codePoint
            .toString(16)
            .toUpperCase()
            .padStart(4, '0');
          const reason = `LLM output rejected: non-Latin character '${bad.char}' (U+${code}) detected`;
          this.logger.warn(`queue entry ${entry.id} rejected: ${reason}`);
          await this.queueRepo.markFailed(entry.id, reason);
          return;
        }
      }
      // Use HTML content directly (LLM generates HTML, Telegram parses with parseMode: 'HTML')
      const result = await this.dispatchToTelegram(
        entry,
        generated.content,
        cfg,
      );
      if (!result.ok || result.messageId === null) {
        throw new Error(result.error ?? 'telegram publish returned no id');
      }
      await this.queueRepo.markPublished(
        entry.id,
        String(result.messageId),
        generated,
      );
      await this.throttleScheduler.setLastPublishAt(now);
      await this.slotArbitrator.recordPublish('news', now);
      await this.rotationStateRepo.incrementPostsSinceLastAd();
      try {
        await this.mediaCleanup.cleanupPublishedMedia(
          entry.imagePaths,
          this.publisherConfig.config.publishing.mediaTtlDays,
        );
      } catch (cleanupErr) {
        this.logger.warn(
          `media cleanup failed for entry ${entry.id} (publish succeeded): ` +
            `${cleanupErr instanceof Error ? cleanupErr.message : 'unknown error'}`,
        );
      }
      this.logger.log(
        `published queue entry ${entry.id} as telegram message ${result.messageId}`,
      );
    } catch (err) {
      // If the publisher isn't configured (bot token / output channel
      // missing), don't mark the entry as FAILED — the entry stays
      // PENDING and we simply skip this tick so the operator can fix
      // the config. Without this guard a misconfigured deploy would
      // burn through the retry budget on every poll.
      if (this.isNotConfiguredError(err)) {
        this.logger.warn(
          `publisher not configured — leaving entry ${entry.id} PENDING ` +
            `(${(err as Error).message})`,
        );
        return;
      }
      await this.handlePublishFailure(entry, err, cfg);
    }
  }

  /**
   * True when the publisher adapter rejected the publish because the
   * operator has not set CRYPTO_NEWS_BOT_TOKEN /
   * CRYPTO_NEWS_OUTPUT_CHANNEL. Identified by the exact error message
   * prefix the adapter returns; kept dumb on purpose (no shared type)
   * because the adapter is the source of truth.
   */
  private isNotConfiguredError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return (
      msg.includes('CRYPTO_NEWS_BOT_TOKEN') ||
      msg.includes('CRYPTO_NEWS_OUTPUT_CHANNEL')
    );
  }

  /**
   * Pick `sendPhoto` (with the local image) when the entry has an
   * `imagePath`; fall back to `sendMessage` otherwise. The adapter
   * itself decides what to do with the `chatId` argument — the
   * crypto-news adapter ignores it and uses the configured channel.
   */
  /**
   * Check if a file path is a video based on extension.
   */
  private isVideoPath(path: string): boolean {
    const ext = path.toLowerCase().split('.').pop();
    return (
      ext === 'mp4' ||
      ext === 'mov' ||
      ext === 'avi' ||
      ext === 'mkv' ||
      ext === 'webm'
    );
  }

  /**
   * Pick the right Telegram API for the entry's images:
   *  - 2+ images → `sendMediaGroup` (album), or `sendVideo` if any is video
   *  - 1 image   → `sendPhoto` or `sendVideo` if video
   *  - 0 images   → `sendMessage`
   */
  private async dispatchToTelegram(
    entry: PublisherQueueEntry,
    refinedText: string,
    cfg: LlmConfig,
  ) {
    // Ensure all media files exist locally before sending to Telegram
    const localPaths = await this.ensureLocalFiles(entry.imagePaths);

    const options = { parseMode: 'HTML' as const };

    if (localPaths.length > 1) {
      const videoIdx = localPaths.findIndex((p) => this.isVideoPath(p));
      if (videoIdx >= 0) {
        // Send the video individually (no mixed album support)
        return this.publisher.sendVideo(
          cfg.targetChannel,
          refinedText,
          localPaths[videoIdx],
          options,
        );
      }
      return this.publisher.sendMediaGroup(
        cfg.targetChannel,
        refinedText,
        localPaths,
        options,
      );
    }
    if (localPaths.length === 1) {
      if (this.isVideoPath(localPaths[0])) {
        return this.publisher.sendVideo(
          cfg.targetChannel,
          refinedText,
          localPaths[0],
          options,
        );
      }
      return this.publisher.sendPhoto(
        cfg.targetChannel,
        refinedText,
        localPaths[0],
        options,
      );
    }
    return this.publisher.sendMessage(
      cfg.targetChannel,
      refinedText,
      undefined,
      options,
    );
  }

  /**
   * Translate a publish failure into the correct queue state
   * transition. Retry budget is `llmMaxAttempts` from LlmConfig. Past
   * the cap, the entry is marked FAILED (terminal).
   */
  private async handlePublishFailure(
    entry: PublisherQueueEntry,
    err: unknown,
    cfg: LlmConfig,
  ): Promise<void> {
    const reason = err instanceof Error ? err.message : 'unknown error';
    this.logger.error(
      `failed to publish queue entry ${entry.id}: ${reason}`,
      err instanceof Error ? err.stack : undefined,
    );
    if (entry.attempts + 1 < cfg.llmMaxAttempts) {
      try {
        await this.queueRepo.incrementAttempts(entry.id);
        this.logger.log(
          `incremented attempts for queue entry ${entry.id} ` +
            `(attempts=${entry.attempts + 1}/${cfg.llmMaxAttempts})`,
        );
      } catch (incErr) {
        this.logger.error(
          `failed to increment attempts for ${entry.id}: ` +
            `${(incErr as Error).message}`,
        );
      }
      return;
    }
    try {
      await this.queueRepo.markFailed(entry.id, reason);
      this.logger.log(
        `queue entry ${entry.id} marked FAILED after ` +
          `${entry.attempts + 1} attempts: ${reason}`,
      );
    } catch (failErr) {
      this.logger.error(
        `failed to mark entry ${entry.id} as FAILED: ` +
          `${(failErr as Error).message}`,
      );
    }
  }

  /**
   * Daily cap: at most `dailyCap` PUBLISHED rows in the current UTC
   * window (resets at `dailyResetUtcHour`).
   */
  private async canPublishToday(cfg: LlmConfig): Promise<boolean> {
    const published = await this.queueRepo.countPublishedToday(
      cfg.dailyResetUtcHour,
    );
    return published < cfg.dailyCap;
  }

  /**
   * Ensure all media files exist locally. If a file doesn't exist,
   * download it from ingestion-service.
   *
   * In dev local, ingestion-service and backend have separate uploads/
   * directories. In production, they share a Docker volume.
   *
   * @param paths - Array of file paths (local or HTTP URLs)
   * @returns Array of local file paths
   */
  private async ensureLocalFiles(
    paths: ReadonlyArray<string>,
  ): Promise<string[]> {
    const localPaths: string[] = [];

    for (const filePath of paths) {
      // If it's a URL, download it
      if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
        this.logger.debug(
          `Queue entry has HTTP URL: ${filePath}, downloading...`,
        );
        const localPath = await this.downloadFromIngestionService(filePath);
        localPaths.push(localPath);
        continue;
      }

      // Check if file exists locally
      try {
        await fs.access(filePath);
        localPaths.push(filePath);
      } catch (_err) {
        // File doesn't exist locally, try downloading from ingestion-service
        this.logger.debug(
          `File not found locally: ${filePath}, attempting download from ingestion-service`,
        );

        try {
          const localPath = await this.downloadFileFromIngestion(filePath);
          localPaths.push(localPath);
        } catch (_downloadErr) {
          throw new Error(`file not found: ${filePath}`);
        }
      }
    }

    return localPaths;
  }

  /**
   * Download a file from ingestion-service given an HTTP URL.
   */
  private async downloadFromIngestionService(url: string): Promise<string> {
    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());

      // Parse URL to extract channelId, messageId, index
      // URL: http://localhost:3031/api/media/-1004466661332/200/0
      const urlObj = new URL(url);
      const parts = urlObj.pathname.split('/').filter(Boolean);

      if (parts.length < 5) {
        throw new Error(`Unexpected URL format: ${url}`);
      }

      const channelId = parts[2];
      const messageId = parts[3];
      const index = parts[4];

      // Determine extension from content-type
      const contentType =
        response.headers.get('content-type') || 'application/octet-stream';
      const ext = this.getExtensionFromMimeType(contentType);

      // Save to backend uploads directory
      const localDir = path.join('uploads', 'crypto-news', 'media', channelId);
      const localFileName = `${messageId}_${index}.${ext}`;
      const localPath = path.join(localDir, localFileName);

      await fs.mkdir(localDir, { recursive: true });
      await fs.writeFile(localPath, buffer);

      this.logger.log(`Downloaded ${url} → ${localPath}`);
      return localPath;
    } catch (err) {
      this.logger.error(`Failed to download from ${url}: ${err}`);
      throw err;
    }
  }

  /**
   * Download a file from ingestion-service given a local path that doesn't exist locally.
   * Converts the path to an ingestion-service URL and downloads it.
   */
  private async downloadFileFromIngestion(localPath: string): Promise<string> {
    // Convert local path to ingestion-service URL
    // Path: uploads/crypto-news/media/-1004466661332/200_0.jpg
    // URL:  http://localhost:3031/api/media/-1004466661332/200/0
    const match = localPath.match(
      /crypto-news\/media\/([^/]+)\/(\d+)_(\d+)\.\w+$/,
    );

    if (!match) {
      throw new Error(`Cannot parse local path: ${localPath}`);
    }

    const channelId = match[1];
    const messageId = match[2];
    const index = match[3];

    const ingestionPort = process.env.INGESTION_PORT || '3031';
    const ingestionUrl = `http://localhost:${ingestionPort}/api/media/${channelId}/${messageId}/${index}`;

    try {
      const response = await fetch(ingestionUrl);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());

      // Ensure directory exists
      const dir = path.dirname(localPath);
      await fs.mkdir(dir, { recursive: true });

      // Save file
      await fs.writeFile(localPath, buffer);

      this.logger.log(`Downloaded ${ingestionUrl} → ${localPath}`);
      return localPath;
    } catch (err) {
      this.logger.error(
        `Failed to download from ingestion: ${ingestionUrl}: ${err}`,
      );
      throw err;
    }
  }

  /**
   * Get file extension from MIME type.
   */
  private getExtensionFromMimeType(mimeType: string): string {
    const map: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'video/mp4': 'mp4',
      'video/quicktime': 'mov',
    };
    return map[mimeType] || 'bin';
  }
}
