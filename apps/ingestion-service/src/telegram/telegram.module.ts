import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { SharedModule } from './shared/shared.module';
import { KolModule } from './kol/kol.module';
import { CryptoNewsModule } from './crypto-news/crypto-news.module';
import { BackendChannelProviderService } from './shared/services/backend-channel-provider.service';
import { TelegramListenerPort } from './shared/ports/telegram-listener.port';
import { IngestionCoordinator } from './shared/application/coordinators/ingestion.coordinator';
import { DebugTelegramController } from './debug/debug-telegram.controller';

/**
 * TelegramModule - Root Telegram ingestion module
 *
 * Orchestrates:
 * 1. Channel fetching from backend DB (replaces seed-based system)
 * 2. MTProto connection initialization
 * 3. Message ingestion pipeline startup
 * 4. Periodic refresh of channel subscriptions
 *
 * Per design.md § 2.1: Extracts MTProto layer from backend and broadcasts via SSE.
 *
 * Lifecycle:
 * - onModuleInit(): Fetches active channels from backend DB, starts MTProto listener
 * - Listener yields messages to IngestionCoordinator
 * - Coordinator broadcasts to StreamService (SSE)
 * - Scheduler refreshes channel list every 5 minutes
 *
 * Migration from seed-based system:
 * - OLD: KolSeeder/CryptoNewsSeeder read from seed files
 * - NEW: BackendChannelProviderService fetches from backend DB via HTTP
 */
@Module({
  imports: [
    SharedModule, // MTProto infrastructure + BackendChannelProviderService
    KolModule, // KOL seeders (DEPRECATED - kept for backward compat)
    CryptoNewsModule, // Crypto news seeders (DEPRECATED - kept for backward compat)
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
    private readonly listener: TelegramListenerPort,
    private readonly coordinator: IngestionCoordinator,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('🚀 Initializing Telegram ingestion service...');

    try {
      // Step 1: Fetch active channels from backend DB
      this.logger.log('📡 Fetching active channels from backend DB...');
      await this.refreshChannels();

      const totalChannels = this.currentChannelIds.length;
      if (totalChannels === 0) {
        this.logger.warn(
          '⚠️ No active channels found in backend DB. Ingestion service will not receive messages.',
        );
        this.logger.warn(
          '💡 Add channels via backend API: POST /telegram-kol/identity/kols or POST /crypto-news/sources',
        );
        return;
      }

      this.logger.log(
        `✅ Channel fetch complete: ${this.kolChannelIds.length} KOLs + ${this.newsChannelIds.length} crypto-news = ${totalChannels} total`,
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
   * Fetch active channel IDs from backend and update local cache
   */
  private async refreshChannels(): Promise<void> {
    try {
      const [kolIds, newsIds] = await Promise.all([
        this.channelProvider.fetchActiveKolIds(),
        this.channelProvider.fetchActiveCryptoNewsSourceIds(),
      ]);

      const previousTotal = this.currentChannelIds.length;
      this.kolChannelIds = kolIds;
      this.newsChannelIds = newsIds;
      this.currentChannelIds = [...kolIds, ...newsIds];

      const newTotal = this.currentChannelIds.length;
      if (newTotal !== previousTotal) {
        this.logger.log(
          `📊 Channel list updated: ${previousTotal} → ${newTotal} (${kolIds.length} KOLs, ${newsIds.length} crypto-news)`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to refresh channel list from backend: ${(error as Error).message}`,
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
      for await (const message of this.listener.subscribe(
        [...this.currentChannelIds],
      )) {
        // Determine message type based on channel
        const messageType = this.newsChannelIds.includes(message.peerId)
          ? 'crypto-news'
          : 'kol';

        // Route message to SSE broadcast via coordinator
        await this.coordinator.route(message, messageType);
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
