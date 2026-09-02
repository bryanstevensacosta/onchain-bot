import { Module, Global } from '@nestjs/common';
import { TelegramMtprotoListenerAdapter } from './api/mtproto/telegram-mtproto-listener.adapter';
import { DeduplicationService } from './application/services/deduplication.service';
import { IngestionCoordinator } from './application/coordinators/ingestion.coordinator';
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

/**
 * SharedModule - Telegram infrastructure shared across KOL and crypto-news ingestion
 *
 * Provides:
 * - TelegramListenerPort implementation (TelegramMtprotoListenerAdapter)
 * - TelegramClientManager (MTProto client lifecycle)
 * - Deduplication service
 * - Ingestion coordinator (routes messages to SSE broadcast)
 * - Flood wait handling
 * - Last seen tracking
 * - Message queue
 * - Media downloader service
 *
 * @Global to avoid circular dependency issues with KolModule and CryptoNewsModule
 */
@Global()
@Module({
  imports: [StreamModule], // For SSE broadcast only
  providers: [
    // Config & Infrastructure
    RedisService,
    IngestionSafetyConfig,

    // MTProto layer
    TelegramClientManager,
    {
      provide: TelegramListenerPort,
      useClass: TelegramMtprotoListenerAdapter,
    },

    // Application layer
    DeduplicationService,
    IngestionCoordinator,

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
    TelegramClientManager,
    TelegramListenerPort,
    DeduplicationService,
    IngestionCoordinator,
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
