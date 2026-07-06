import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KeywordEntity } from 'telegram/crypto-news-publisher/infrastructure/persistence/typeorm/entities/keyword.entity';
import { PublisherQueueEntity } from 'telegram/crypto-news-publisher/infrastructure/persistence/typeorm/entities/publisher-queue.entity';
import { PublisherThrottleStateEntity } from 'telegram/crypto-news-publisher/infrastructure/persistence/typeorm/entities/publisher-throttle-state.entity';
import { KeywordRepository } from 'telegram/crypto-news-publisher/application/ports/keyword.repository';
import { PublisherQueueRepository } from 'telegram/crypto-news-publisher/application/ports/publisher-queue.repository';
import { PublisherThrottleStateRepository } from 'telegram/crypto-news-publisher/application/ports/publisher-throttle-state.repository';
import { TypeOrmKeywordRepository } from 'telegram/crypto-news-publisher/infrastructure/persistence/typeorm/repositories/typeorm-keyword.repository';
import { TypeOrmPublisherQueueRepository } from 'telegram/crypto-news-publisher/infrastructure/persistence/typeorm/repositories/typeorm-publisher-queue.repository';
import { TypeOrmPublisherThrottleStateRepository } from 'telegram/crypto-news-publisher/infrastructure/persistence/typeorm/repositories/typeorm-publisher-throttle-state.repository';
import { EnqueueMatchingMessageUseCase } from 'telegram/crypto-news-publisher/application/handlers/enqueue-matching-message.use-case';
import { CryptoNewsMessageIngestedHandler } from 'telegram/crypto-news-publisher/infrastructure/event-bus/crypto-news-message-ingested.handler';
import { KeywordsController } from 'telegram/crypto-news-publisher/api/http/keywords.controller';
import { QueueController } from 'telegram/crypto-news-publisher/api/http/queue.controller';
import { CryptoNewsIngestionModule } from 'telegram/ingestion/crypto-news/crypto-news-ingestion.module';

/**
 * Crypto-news publisher BC.
 *
 * Wave 3 scope adds the event-driven ingestion path:
 *  - `EnqueueMatchingMessageUseCase` builds and persists a
 *    `PublisherQueueEntry` from a matched `CryptoNewsMessage`.
 *  - `CryptoNewsMessageIngestedHandler` subscribes to
 *    `CryptoNewsMessageIngestedEvent`, fetches the full message,
 *    tests enabled keywords, and enqueues matches.
 *  - `KeywordsController` (CRUD) and `QueueController` (read) expose
 *    the BC to the dashboard.
 *
 * `CryptoNewsMessageRepository` is provided by `CryptoNewsIngestionModule`
 * (no duplicate provider here — Nest resolves the injection token from
 * the imported module's exports).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      KeywordEntity,
      PublisherQueueEntity,
      PublisherThrottleStateEntity,
    ]),
    CryptoNewsIngestionModule,
  ],
  controllers: [KeywordsController, QueueController],
  providers: [
    TypeOrmKeywordRepository,
    TypeOrmPublisherQueueRepository,
    TypeOrmPublisherThrottleStateRepository,
    {
      provide: KeywordRepository,
      useClass: TypeOrmKeywordRepository,
    },
    {
      provide: PublisherQueueRepository,
      useClass: TypeOrmPublisherQueueRepository,
    },
    {
      provide: PublisherThrottleStateRepository,
      useClass: TypeOrmPublisherThrottleStateRepository,
    },
    EnqueueMatchingMessageUseCase,
    CryptoNewsMessageIngestedHandler,
  ],
  exports: [
    KeywordRepository,
    PublisherQueueRepository,
    PublisherThrottleStateRepository,
  ],
})
export class CryptoNewsPublisherModule {}
