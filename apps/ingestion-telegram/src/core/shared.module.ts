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
import { TelegramFeedSourceEntity } from 'registry/infrastructure/persistence/typeorm/entities/telegram-feed-source.entity';
import { TelegramFeedMessageEntity } from 'feed/infrastructure/persistence/typeorm/entities/telegram-feed-message.entity';
import { TelegramFeedMessageMediaEntity } from 'feed/infrastructure/persistence/typeorm/entities/telegram-feed-message-media.entity';
import { TelegramFeedSourceRepository } from 'registry/infrastructure/persistence/typeorm/repositories/typeorm-feed-source.repository';
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
      TelegramFeedSourceEntity,
      TelegramFeedMessageEntity,
      TelegramFeedMessageMediaEntity,
    ]), // For feed persistence
  ],
  providers: [
    // Config & Infrastructure
    RedisService,
    IngestionSafetyConfig,

    // Backend integration
    BackendChannelProviderService,

    // Feed DB repositories
    TelegramFeedSourceRepository,
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
    TelegramFeedSourceRepository, // Export for feed modules
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
