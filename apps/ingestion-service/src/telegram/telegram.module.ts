import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { SharedModule } from './shared/shared.module';
import { KolModule } from './kol/kol.module';
import { CryptoNewsModule } from './crypto-news/crypto-news.module';
import { KolSeeder } from './kol/seeders/kol.seeder';
import { CryptoNewsSeeder } from './crypto-news/seeders/crypto-news.seeder';
import { TelegramListenerPort } from './shared/ports/telegram-listener.port';
import { IngestionCoordinator } from './shared/application/coordinators/ingestion.coordinator';
import { DebugTelegramController } from './debug/debug-telegram.controller';

/**
 * TelegramModule - Root Telegram ingestion module
 *
 * Orchestrates:
 * 1. Channel seeding (KOL + crypto-news) on bootstrap
 * 2. MTProto connection initialization
 * 3. Message ingestion pipeline startup
 *
 * Per design.md § 2.1: Extracts MTProto layer from backend and broadcasts via SSE.
 *
 * Lifecycle:
 * - onModuleInit(): Seeds channels, starts MTProto listener
 * - Listener yields messages to IngestionCoordinator
 * - Coordinator broadcasts to StreamService (SSE)
 */
@Module({
  imports: [
    SharedModule, // MTProto infrastructure
    KolModule, // KOL seeders
    CryptoNewsModule, // Crypto news seeders
  ],
  controllers: [DebugTelegramController],
  exports: [SharedModule, KolModule, CryptoNewsModule],
})
export class TelegramModule implements OnModuleInit {
  private readonly logger = new Logger(TelegramModule.name);

  constructor(
    private readonly kolSeeder: KolSeeder,
    private readonly cryptoNewsSeeder: CryptoNewsSeeder,
    private readonly listener: TelegramListenerPort,
    private readonly coordinator: IngestionCoordinator,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('🚀 Initializing Telegram ingestion service...');

    try {
      // Step 1: Seed channels
      this.logger.log('📡 Seeding KOL channels...');
      const kolResult = await this.kolSeeder.seed();
      this.logger.log(
        `✅ KOL seeding complete: ${kolResult.added} added, ${kolResult.skipped} skipped, ${kolResult.failed} failed`,
      );

      this.logger.log('📰 Seeding crypto-news channels...');
      const newsResult = await this.cryptoNewsSeeder.seed();
      this.logger.log(
        `✅ Crypto-news seeding complete: ${newsResult.added} added, ${newsResult.skipped} skipped, ${newsResult.failed} failed`,
      );

      // Step 2: Start MTProto listener
      const totalChannels = kolResult.added + newsResult.added;
      if (totalChannels === 0) {
        this.logger.warn(
          '⚠️ No channels seeded. Ingestion service will not receive messages.',
        );
        return;
      }

      this.logger.log(
        `🎧 Starting MTProto listener for ${totalChannels} channels...`,
      );

      // Start listening in background (non-blocking)
      this.startListening().catch((error) => {
        this.logger.error('❌ MTProto listener crashed:', error);
        // TODO: Implement restart logic or alert
      });

      this.logger.log('✅ Telegram ingestion service initialized');
    } catch (error) {
      this.logger.error('❌ Failed to initialize Telegram module:', error);
      throw error;
    }
  }

  private async startListening(): Promise<void> {
    this.logger.log('🔄 MTProto listener running (background task)');
    
    // Get registered channel IDs from both seeders
    const kolChannels = this.kolSeeder.getRegisteredChannels();
    const newsChannels = this.cryptoNewsSeeder.getRegisteredChannels();
    const allChannelIds = [...kolChannels, ...newsChannels];
    
    if (allChannelIds.length === 0) {
      this.logger.warn('No channels to listen to');
      return;
    }
    
    this.logger.log(`📻 Subscribing to ${allChannelIds.length} channels (${kolChannels.length} KOL, ${newsChannels.length} crypto-news)...`);
    
    try {
      // Subscribe to listener's async generator
      for await (const message of this.listener.subscribe(allChannelIds)) {
        // Determine message type based on channel
        const messageType = newsChannels.includes(message.peerId) ? 'crypto-news' : 'kol';
        
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
