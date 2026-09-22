import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TelegramMtprotoListenerAdapter } from './api/mtproto/telegram-mtproto-listener.adapter';
import { BackendChannelProviderService } from './services/backend-channel-provider.service';
import { DeduplicationService } from './application/services/deduplication.service';
import { MessagePersistenceCoordinator } from './application/coordinators/message-persistence.coordinator';
import { TelegramClientManager } from './infrastructure/services/telegram-client-manager.service';
import { LastSeenManager } from './infrastructure/services/last-seen-manager.service';
import { FloodWaitHandlerService } from './infrastructure/services/flood-wait-handler.service';
import { FloodWaitCounterService } from './infrastructure/services/flood-wait-counter.service';
import { SleepWindowService } from './infrastructure/services/sleep-window.service';
import { TelegramPeerResolver } from './infrastructure/services/telegram-peer-resolver';
import { MessageQueue } from './infrastructure/services/message-queue';
import { TelegramListenerPort } from './ports/telegram-listener.port';
import { StreamModule } from 'stream/stream.module';
import { MediaDownloaderService } from 'media/application/services/media-downloader.service';
import { RedisService } from 'shared/common/cache/redis.service';
import { IngestionSafetyConfig } from './infrastructure/config/ingestion-safety.config';
import { CryptoNewsSourceEntity } from 'registry/infrastructure/persistence/typeorm/entities/crypto-news-source.entity';
import { CryptoNewsMessageEntity } from 'feed/infrastructure/persistence/typeorm/entities/crypto-news-message.entity';
import { TelegramFeedMessageEntity } from 'feed/infrastructure/persistence/typeorm/entities/telegram-feed-message.entity';
import { TelegramFeedMessageMediaEntity } from 'feed/infrastructure/persistence/typeorm/entities/telegram-feed-message-media.entity';
import { CryptoNewsSourceRepository } from 'registry/infrastructure/persistence/typeorm/repositories/crypto-news-source.repository';
import { TelegramFeedSourceEntity } from 'registry/infrastructure/persistence/typeorm/entities/telegram-feed-source.entity';
import { TelegramFeedSourceRepository } from 'registry/infrastructure/persistence/typeorm/repositories/typeorm-feed-source.repository';
import { CryptoNewsMessageRepository } from 'feed/infrastructure/persistence/typeorm/repositories/crypto-news-message.repository';
import { TelegramFeedMessageRepository } from 'feed/infrastructure/persistence/typeorm/repositories/telegram-feed-message.repository';
import { CryptoNewsMessageTransformer } from 'shared/telegram/transformation';
import { TelegramMediaExtractorService } from './application/services/telegram-media-extractor.service';

/**
 * SharedModule - Telegram infrastructure shared across KOL and crypto-news ingestion
 *
 * Provides:
 * - TelegramListenerPort implementation (TelegramMtprotoListenerAdapter)
 * - BackendChannelProviderService (fetches active channels from backend DB)
 * - TelegramClientManager (MTProto client lifecycle)
 * - Deduplication service
 * - Ingestion coordinator (routes messages to SSE broadcast)
 * - Flood wait handling
 * - Last seen tracking
 * - Message queue
 * - Media downloader service
 * - CryptoNewsMessageTransformer (shared transformation pipeline, Phase 5)
 *
 * @Global to avoid circular dependency issues with KolModule and CryptoNewsModule
 */
@Global()
@Module({
  imports: [
    StreamModule, // For SSE broadcast only
    TypeOrmModule.forFeature([
      CryptoNewsSourceEntity,
      TelegramFeedSourceEntity,
      CryptoNewsMessageEntity,
      TelegramFeedMessageEntity,
      TelegramFeedMessageMediaEntity,
    ]), // For crypto-news persistence
  ],
  providers: [
    // Config & Infrastructure
    RedisService,
    IngestionSafetyConfig,

    // Backend integration
    BackendChannelProviderService,

    // Crypto-news DB repositories
    CryptoNewsSourceRepository,
    TelegramFeedSourceRepository,
    CryptoNewsMessageRepository,
    TelegramFeedMessageRepository,

    // MTProto layer
    TelegramClientManager,
    {
      provide: TelegramListenerPort,
      useClass: TelegramMtprotoListenerAdapter,
    },

    // Message transformation (Phase 5 - shared pipeline)
    {
      provide: CryptoNewsMessageTransformer,
      useFactory: () => {
        // CryptoNewsMessageTransformer only extracts metadata (no download)
        // Media download is handled separately by TelegramMediaExtractorService
        return new CryptoNewsMessageTransformer();
      },
    },

    // Media extraction + download (Phase 5.2 - extracted from adapter)
    TelegramMediaExtractorService,

    // Application layer
    DeduplicationService,
    MessagePersistenceCoordinator,

    // Infrastructure services
    LastSeenManager,
    FloodWaitHandlerService,
    FloodWaitCounterService,
    SleepWindowService,
    TelegramPeerResolver,
    MessageQueue,
    MediaDownloaderService, // Media download service
  ],
  exports: [
    RedisService,
    IngestionSafetyConfig,
    BackendChannelProviderService,
    CryptoNewsSourceRepository, // Export for CryptoNewsModule
    TelegramFeedSourceRepository, // Export for future feed modules
    CryptoNewsMessageRepository, // Export for CryptoNewsModule
    TelegramFeedMessageRepository, // Export for feed readers (item 3)
    TelegramClientManager,
    TelegramListenerPort,
    CryptoNewsMessageTransformer, // Export transformer (Phase 5)
    DeduplicationService,
    MessagePersistenceCoordinator,
    LastSeenManager,
    FloodWaitHandlerService,
    FloodWaitCounterService,
    SleepWindowService,
    TelegramPeerResolver,
    MessageQueue,
    MediaDownloaderService, // Export for MediaController
  ],
})
export class SharedModule {}
