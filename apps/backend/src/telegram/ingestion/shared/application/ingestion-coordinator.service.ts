import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from 'shared/common/config/app.config';
import { TelegramListenerPort } from 'telegram/ingestion/shared/domain/ports/telegram-listener.port';
import type { TelegramRawMessage } from 'telegram/ingestion/shared/domain/ports/telegram-listener.port';
import { CryptoNewsMedia } from 'telegram/ingestion/crypto-news/domain/value-objects/crypto-news-media.vo';
import { TELEGRAM_LISTENER_PORT_TOKEN } from 'telegram/ingestion/shared/shared-injection-tokens';
import { KolSeeder } from 'telegram/ingestion/kol/seeders/kol.seeder';
import { CryptoNewsSeeder } from 'telegram/ingestion/crypto-news/infrastructure/seeders/crypto-news.seeder';
import { KolRepository } from 'kol/identity/application/ports/kol.repository';
import { CryptoNewsSourceRepository } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-source.repository';
import { KolIngestionOrchestratorUseCase } from 'kol/identity/application/handlers/kol-ingestion-orchestrator.use-case';
import { StoreNewsMessageUseCase } from 'telegram/ingestion/crypto-news/application/handlers/store-news-message.use-case';

/**
 * Single subscription point for ALL Telegram channels (KOL + crypto-news).
 *
 * Replaces the previous per-seeder auto-start pattern. On application
 * bootstrap:
 * 1. Run KolSeeder.seed() (idempotent registration of KOL channels)
 * 2. Run CryptoNewsSeeder.seed() (idempotent registration of news channels)
 * 3. Collect every active channel from both repos
 * 4. Subscribe ONCE to the TelegramListenerPort
 * 5. Route each incoming message to the right handler based on channel type
 *
 * Routing: a message is routed to the news handler iff its peerId is
 * registered in `CryptoNewsSourceRepository`. Otherwise it is routed to
 * the KOL orchestrator (which itself no-ops for unknown kolIds as
 * defense in depth).
 *
 * Per fix-1 (Bot Dev ToS §4.3): raw message text is consumed by direct
 * use case calls here; it never crosses an event bus.
 */
@Injectable()
export class IngestionCoordinator implements OnApplicationBootstrap {
  private readonly logger = new Logger(IngestionCoordinator.name);

  constructor(
    private readonly config: ConfigService,
    private readonly kolSeeder: KolSeeder,
    private readonly cryptoNewsSeeder: CryptoNewsSeeder,
    private readonly kolRepo: KolRepository,
    private readonly cryptoNewsSourceRepo: CryptoNewsSourceRepository,
    private readonly kolOrchestrator: KolIngestionOrchestratorUseCase,
    private readonly storeNewsMessage: StoreNewsMessageUseCase,
    @Inject(TELEGRAM_LISTENER_PORT_TOKEN)
    private readonly listener: TelegramListenerPort,
  ) {}

  public async onApplicationBootstrap(): Promise<void> {
    this.logger.log(
      '⏳ [HOOK-DEBUG] IngestionCoordinator.onApplicationBootstrap() START',
    );

    this.logger.log('[HOOK-DEBUG] Step 1: Reading seed configs');
    const seedConfig =
      this.config.get<AppConfig>('app')?.ingestion?.telegram?.seed;
    const newsSeedConfig =
      this.config.get<AppConfig>('app')?.ingestion?.telegram?.newsSeed;

    this.logger.log('[HOOK-DEBUG] Step 2: Checking KOL seed config');
    if (seedConfig?.enabled) {
      this.logger.log('[HOOK-DEBUG] Step 2a: Calling kolSeeder.seed()');
      await this.kolSeeder.seed().catch((err: unknown) => {
        this.logger.error(
          `KOL seeding failed: ${err instanceof Error ? err.message : String(err)}`,
          err instanceof Error ? err.stack : undefined,
        );
      });
      this.logger.log('[HOOK-DEBUG] Step 2b: kolSeeder.seed() completed');
    } else {
      this.logger.debug('KOL seed disabled; skipping.');
    }

    this.logger.log('[HOOK-DEBUG] Step 3: Checking crypto-news seed config');
    if (newsSeedConfig?.enabled) {
      this.logger.log('[HOOK-DEBUG] Step 3a: Calling cryptoNewsSeeder.seed()');
      await this.cryptoNewsSeeder.seed().catch((err: unknown) => {
        this.logger.error(
          `Crypto-news seeding failed: ${err instanceof Error ? err.message : String(err)}`,
          err instanceof Error ? err.stack : undefined,
        );
      });
      this.logger.log(
        '[HOOK-DEBUG] Step 3b: cryptoNewsSeeder.seed() completed',
      );
    } else {
      this.logger.debug('Crypto-news seed disabled; skipping.');
    }

    this.logger.log('[HOOK-DEBUG] Step 4: Finding active KOLs');
    const activeKols = (await this.kolRepo.findAll()).filter((k) => k.isActive);
    this.logger.log(
      `[HOOK-DEBUG] Step 4a: Found ${activeKols.length} active KOLs`,
    );

    this.logger.log('[HOOK-DEBUG] Step 5: Finding active news sources');
    const activeNews = await this.cryptoNewsSourceRepo.findActive();
    this.logger.log(
      `[HOOK-DEBUG] Step 5a: Found ${activeNews.length} active news sources`,
    );

    this.logger.log('[HOOK-DEBUG] Step 6: Building channel list');
    const allChannelIds = [
      ...activeKols.map((k) => k.kolId.value),
      ...activeNews.map((s) => s.channelId),
    ];

    if (allChannelIds.length === 0) {
      this.logger.warn(
        'No active channels to subscribe (KOL + news); coordinator idle.',
      );
      this.logger.log(
        '✅ [HOOK-DEBUG] IngestionCoordinator.onApplicationBootstrap() completed (no channels)',
      );
      return;
    }

    this.logger.log(
      `[HOOK-DEBUG] Step 7: Subscribing to ${allChannelIds.length} channel(s) (${activeKols.length} KOL, ${activeNews.length} news).`,
    );
    // Start subscription in background - don't await to avoid blocking bootstrap
    setImmediate(() => {
      this.logger.log('[HOOK-DEBUG] Step 7a: setImmediate callback executing');
      void this.consumeAll(allChannelIds);
    });
    this.logger.log(
      '✅ [HOOK-DEBUG] IngestionCoordinator.onApplicationBootstrap() END',
    );
  }

  private async consumeAll(channelIds: string[]): Promise<void> {
    try {
      this.logger.log(
        `[CONSUME-DEBUG] Starting to consume messages from ${channelIds.length} channels...`,
      );

      for await (const raw of this.listener.subscribe(channelIds)) {
        this.logger.log(
          `[CONSUME-DEBUG] Received message from ${raw.peerId}:${raw.messageId}`,
        );
        await this.route(raw);
      }

      this.logger.warn(
        '[CONSUME-DEBUG] Listener subscription ended (should never happen)',
      );
    } catch (err) {
      this.logger.error(
        `[CONSUME-DEBUG] Subscription error: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      );
    }
  }

  private async route(raw: TelegramRawMessage): Promise<void> {
    try {
      this.logger.log(
        `[ROUTE-DEBUG] Starting to route message ${raw.peerId}:${raw.messageId}`,
      );

      const newsSource = await this.cryptoNewsSourceRepo.findByChannelId(
        raw.peerId,
      );

      this.logger.log(
        `[ROUTE-DEBUG] newsSource lookup result: ${newsSource ? 'FOUND (crypto-news)' : 'NOT FOUND (will route to KOL)'}`,
      );

      if (newsSource) {
        this.logger.log(
          `[ROUTE-DEBUG] Routing to crypto-news handler for ${raw.peerId}:${raw.messageId}`,
        );
        this.logger.log(
          `[TEXT-DEBUG] raw.text value: "${raw.text}" (type: ${typeof raw.text}, length: ${raw.text?.length ?? 0})`,
        );

        const media =
          raw.media !== undefined && raw.media.length > 0
            ? raw.media
                .filter((m) => m.filePath !== undefined && m.filePath !== '')
                .map((m) => {
                  // Convert HTTP URL to local file path if needed
                  // SSE sends URLs like: http://localhost:3031/api/media/-1004466661332/200/0
                  // We need local paths like: uploads/crypto-news/media/-1004466661332/200_0.jpg
                  const localPath = this.convertMediaUrlToLocalPath(
                    m.filePath as string,
                  );

                  return CryptoNewsMedia.create({
                    index: m.index ?? 0,
                    type: m.webpageUrl ? 'webpage' : m.type,
                    filePath: localPath,
                    mimeType: m.mimeType,
                    fileSize: m.fileSize ?? null,
                  });
                })
            : undefined;

        await this.storeNewsMessage.execute({
          channelId: raw.peerId,
          messageId: raw.messageId,
          title: null,
          content: raw.text,
          occurredAt: raw.occurredAt,
          ...(media !== undefined ? { media } : {}),
          ...(raw.entities !== undefined ? { entities: raw.entities } : {}),
          ...(raw.groupedId !== undefined && raw.groupedId !== null
            ? { groupedId: String(raw.groupedId) }
            : {}),
        });

        this.logger.log(
          `[ROUTE-DEBUG] ✅ Crypto-news handler completed for ${raw.peerId}:${raw.messageId}`,
        );
        return;
      }

      // Fall through to KOL pipeline
      this.logger.log(
        `[ROUTE-DEBUG] Routing to KOL orchestrator for ${raw.peerId}:${raw.messageId}`,
      );
      await this.kolOrchestrator.onMessageReceived(raw);
      this.logger.log(
        `[ROUTE-DEBUG] ✅ KOL orchestrator completed for ${raw.peerId}:${raw.messageId}`,
      );
    } catch (err) {
      this.logger.error(
        `[ROUTE-DEBUG] ❌ Failed to route message ${raw.peerId}:${raw.messageId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
        err instanceof Error ? err.stack : undefined,
      );
    }
  }

  /**
   * Convert HTTP URL from ingestion-service to local file path.
   *
   * SSE sends URLs like:
   *   http://localhost:3031/api/media/-1004466661332/200/0
   *
   * We need local paths like:
   *   uploads/crypto-news/media/-1004466661332/200_0.jpg
   *
   * In production, both backend and ingestion-service share the same
   * uploads volume, so the file is accessible at the same relative path.
   *
   * This method checks the filesystem to find the actual file with its
   * correct extension (.jpg, .png, .webp, .gif, .mp4, etc.)
   *
   * @param urlOrPath - URL from SSE or already a local path
   * @returns Local file path relative to backend root
   */
  private convertMediaUrlToLocalPath(urlOrPath: string): string {
    // If already a local path (doesn't start with http), return as-is
    if (!urlOrPath.startsWith('http://') && !urlOrPath.startsWith('https://')) {
      return urlOrPath;
    }

    try {
      // Parse URL: http://localhost:3031/api/media/-1004466661332/200/0
      const url = new URL(urlOrPath);
      const pathParts = url.pathname.split('/').filter(Boolean);

      // Expected: ['api', 'media', channelId, messageId, index]
      if (
        pathParts.length < 5 ||
        pathParts[0] !== 'api' ||
        pathParts[1] !== 'media'
      ) {
        this.logger.warn(
          `[MEDIA-URL-CONVERT] Unexpected URL format, using as-is: ${urlOrPath}`,
        );
        return urlOrPath;
      }

      const channelId = pathParts[2];
      const messageId = pathParts[3];
      const index = pathParts[4];

      // Ingestion-service saves files as: uploads/crypto-news/media/channelId/messageId_index.ext
      const baseLocalPath = `uploads/crypto-news/media/${channelId}/${messageId}_${index}`;
      const baseDirPath = `uploads/crypto-news/media/${channelId}`;
      const filePrefix = `${messageId}_${index}.`;

      // Check if directory exists
      if (!fs.existsSync(baseDirPath)) {
        this.logger.warn(
          `[MEDIA-URL-CONVERT] Directory not found: ${baseDirPath}, using default .jpg`,
        );
        return `${baseLocalPath}.jpg`;
      }

      // Find file with any extension
      const files = fs.readdirSync(baseDirPath);
      const matchingFile = files.find((f) => f.startsWith(filePrefix));

      if (matchingFile) {
        const localPath = path.join(baseDirPath, matchingFile);
        this.logger.debug(`[MEDIA-URL-CONVERT] ${urlOrPath} → ${localPath}`);
        return localPath;
      }

      // Fallback to .jpg if file not found
      this.logger.warn(
        `[MEDIA-URL-CONVERT] File not found with prefix ${filePrefix} in ${baseDirPath}, using default .jpg`,
      );
      return `${baseLocalPath}.jpg`;
    } catch (err) {
      this.logger.warn(
        `[MEDIA-URL-CONVERT] Failed to convert media URL, using as-is: ${urlOrPath} (${(err as Error).message})`,
      );
      return urlOrPath;
    }
  }
}

import * as fs from 'fs';
import * as path from 'path';
