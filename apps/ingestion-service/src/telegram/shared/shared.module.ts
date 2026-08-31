import { Module } from '@nestjs/common';
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
 */
@Module({
  imports: [StreamModule], // For SSE broadcast
  providers: [
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
  ],
  exports: [
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
  ],
})
export class SharedModule {}
