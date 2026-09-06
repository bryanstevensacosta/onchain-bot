import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { SharedModule } from './shared/shared.module';
import { KolModule } from './kol/kol.module';
import { CryptoNewsModule } from './crypto-news/crypto-news.module';
import { StreamModule } from '../stream/stream.module';
import { BackendChannelProviderService } from './shared/services/backend-channel-provider.service';
import { TelegramListenerPort } from './shared/ports/telegram-listener.port';
import { IngestionCoordinator } from './shared/application/coordinators/ingestion.coordinator';
import { SSEBroadcastService } from '../stream/application/services/sse-broadcast.service';
import { BroadcastEvent } from '../stream/domain/broadcast-event.vo';
import { DebugTelegramController } from './debug/debug-telegram.controller';
import { CryptoNewsSourceRepository } from './crypto-news/infrastructure/persistence/typeorm/repositories/crypto-news-source.repository';

/**
 * TelegramModule - Root Telegram ingestion module
 *
 * Orchestrates:
 * 1. Channel fetching from local DB (crypto-news) and backend DB (KOLs)
 * 2. MTProto connection initialization
 * 3. Message ingestion pipeline startup
 * 4. Periodic refresh of channel subscriptions
 *
 * Per design.md § 2.1: Extracts MTProto layer from backend and broadcasts via SSE.
 * Per Requirement 4.1: Broadcasts ingested messages to all backends via SSEBroadcastService
 * Per Requirement 4.3: Ingestion continues if broadcast fails (log error, don't throw)
 *
 * Lifecycle:
 * - onModuleInit(): Fetches active channels (KOLs from backend, crypto-news from local DB), starts MTProto listener
 * - Listener yields messages to IngestionCoordinator
 * - Coordinator broadcasts to StreamService (legacy SSE)
 * - TelegramModule broadcasts to SSEBroadcastService (multi-backend SSE)
 * - Scheduler refreshes channel list every 5 minutes
 *
 * Migration from backend HTTP polling:
 * - OLD: BackendChannelProviderService.fetchActiveCryptoNewsSourceIds() via HTTP (DEPRECATED)
 * - NEW: CryptoNewsSourceRepository.findAllActive() from local DB (ingestion-service owns crypto-news sources)
 * - KOLs still fetched from backend DB (backend owns KOL identity)
 */
@Module({
  imports: [
    SharedModule, // MTProto infrastructure + BackendChannelProviderService
    KolModule, // KOL seeders (DEPRECATED - kept for backward compat)
    CryptoNewsModule, // Crypto news seeders (DEPRECATED - kept for backward compat)
    StreamModule, // SSE infrastructure + SSEBroadcastService
  ],
  controllers: [DebugTelegramController],
  exports: [SharedModule, KolModule, CryptoNewsModule],
})
export class TelegramModule implements OnModuleInit {
  private readonly logger = new Logger(TelegramModule.name);
  private currentChannelIds: ReadonlyArray<string> = [];
  private kolChannelIds: ReadonlyArray<string> = [];
  private newsChannelIds: ReadonlyArray<string> = [];
  private refreshIntervalId?: NodeJS.Timeout;

  constructor(
    private readonly channelProvider: BackendChannelProviderService,
    private readonly cryptoNewsSourceRepo: CryptoNewsSourceRepository,
    private readonly listener: TelegramListenerPort,
    private readonly coordinator: IngestionCoordinator,
    private readonly sseBroadcast: SSEBroadcastService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('🚀 Initializing Telegram ingestion service...');

    try {
      // Step 1: Fetch active channels (KOLs from backend, crypto-news from local DB)
      this.logger.log('📡 Fetching active channels...');
      await this.refreshChannels();

      const totalChannels = this.currentChannelIds.length;
      if (totalChannels === 0) {
        this.logger.warn(
          '⚠️ No active channels found. Ingestion service will not receive messages.',
        );
        this.logger.warn(
          '💡 Add channels via: KOLs → backend API POST /telegram-kol/identity/kols, crypto-news → ingestion-service API POST /api/crypto-news/sources',
        );
        return;
      }

      this.logger.log(
        `✅ Channel fetch complete: ${this.kolChannelIds.length} KOLs (from backend) + ${this.newsChannelIds.length} crypto-news (from local DB) = ${totalChannels} total`,
      );

      // Step 2: Start MTProto listener
      this.logger.log(
        `🎧 Starting MTProto listener for ${totalChannels} channels...`,
      );

      // Start listening in background (non-blocking)
      this.startListening().catch((error) => {
        this.logger.error('❌ MTProto listener crashed:', error);
        // TODO: Implement restart logic or alert
      });

      // Step 3: Schedule periodic channel list refresh (every 5 minutes)
      this.scheduleChannelRefresh();

      this.logger.log('✅ Telegram ingestion service initialized');
    } catch (error) {
      this.logger.error('❌ Failed to initialize Telegram module:', error);
      throw error;
    }
  }

  /**
   * Fetch active channel IDs and update local cache
   *
   * Architecture (post-migration):
   * - KOLs: Fetched from backend DB via HTTP (backend owns KOL identity)
   * - Crypto-news: Read from local DB (ingestion-service owns crypto-news sources)
   *
   * This replaces the old system where both were fetched via HTTP from backend.
   */
  private async refreshChannels(): Promise<void> {
    try {
      // Fetch KOLs from backend (backend still owns KOL identity)
      const kolIds = await this.channelProvider.fetchActiveKolIds();

      // Fetch crypto-news sources from LOCAL DB (ingestion-service owns this now)
      const cryptoNewsSources =
        await this.cryptoNewsSourceRepo.findAllActive();
      const newsIds = cryptoNewsSources.map((source) => source.channelId);

      const previousTotal = this.currentChannelIds.length;
      const previousKolCount = this.kolChannelIds.length;
      const previousNewsCount = this.newsChannelIds.length;

      this.kolChannelIds = kolIds;
      this.newsChannelIds = newsIds;
      this.currentChannelIds = [...kolIds, ...newsIds];

      const newTotal = this.currentChannelIds.length;
      const kolCountChanged = kolIds.length !== previousKolCount;
      const newsCountChanged = newsIds.length !== previousNewsCount;
      const channelsChanged = kolCountChanged || newsCountChanged;

      if (newTotal !== previousTotal) {
        this.logger.log(
          `📊 Channel list updated: ${previousTotal} → ${newTotal} (${kolIds.length} KOLs from backend, ${newsIds.length} crypto-news from local DB)`,
        );

        // Restart listener with new channel list if already running
        if (previousTotal > 0 && channelsChanged) {
          this.logger.log(
            '🔄 Channel list changed, restarting listener with updated channels...',
          );
          // Note: We can't cancel the existing async iterator directly,
          // but the listener adapter should handle re-subscription gracefully
          this.startListening().catch((error) => {
            this.logger.error('❌ Listener restart failed:', error);
          });
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to refresh channel list: ${(error as Error).message}`,
      );
      // Keep existing channel list on error
    }
  }

  /**
   * Schedule periodic refresh of channel list (every 5 minutes)
   */
  private scheduleChannelRefresh(): void {
    const refreshIntervalMs = 5 * 60 * 1000; // 5 minutes
    this.refreshIntervalId = setInterval(() => {
      this.logger.debug('⏰ Scheduled channel refresh triggered');
      this.refreshChannels();
    }, refreshIntervalMs);

    this.logger.log(
      `⏱️ Channel refresh scheduled every ${refreshIntervalMs / 1000}s`,
    );
  }

  private async startListening(): Promise<void> {
    this.logger.log('🔄 MTProto listener running (background task)');

    if (this.currentChannelIds.length === 0) {
      this.logger.warn('No channels to listen to');
      return;
    }

    this.logger.log(
      `📻 Subscribing to ${this.currentChannelIds.length} channels (${this.kolChannelIds.length} KOL, ${this.newsChannelIds.length} crypto-news)...`,
    );

    try {
      // Subscribe to listener's async generator
      // Convert readonly array to mutable array for compatibility with TelegramListenerPort
      for await (const message of this.listener.subscribe([
        ...this.currentChannelIds,
      ])) {
        // Determine message type based on channel
        const messageType = this.newsChannelIds.includes(message.peerId)
          ? 'crypto-news'
          : 'kol';

        // Route message to legacy SSE broadcast via coordinator
        await this.coordinator.route(message, messageType);

        // Per Requirement 4.1: Broadcast to all backends via SSEBroadcastService
        // Per Requirement 4.3: Ingestion continues if broadcast fails
        try {
          // Extract media path from message (first media item if available)
          const mediaPath = message.media?.[0]?.filePath;

          // Create BroadcastEvent from raw Telegram message
          const event = BroadcastEvent.fromTelegramMessage(
            message.peerId,
            {
              id: message.messageId,
              message: message.text,
              date: Math.floor(message.occurredAt.getTime() / 1000), // Convert ms to seconds
            },
            mediaPath,
          );

          // Broadcast to all connected backends
          await this.sseBroadcast.broadcast(event);

          this.logger.debug(
            `Broadcasted to multi-backend SSE: ${message.peerId}:${message.messageId}`,
          );
        } catch (broadcastError) {
          // Per Requirement 4.3: Log error but don't throw - ingestion must continue
          this.logger.error(
            `Failed to broadcast message ${message.peerId}:${message.messageId} to multi-backend SSE: ${(broadcastError as Error).message}`,
            (broadcastError as Error).stack,
          );
          // Continue processing - broadcast failure should not stop ingestion
        }
      }
    } catch (error) {
      this.logger.error(
        '❌ MTProto listener error:',
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }
}
