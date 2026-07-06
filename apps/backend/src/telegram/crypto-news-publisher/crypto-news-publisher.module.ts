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
import { ProcessNextQueuedArticleUseCase } from 'telegram/crypto-news-publisher/application/handlers/process-next-queued-article.use-case';
import { ThrottleSchedulerService } from 'telegram/crypto-news-publisher/application/services/throttle-scheduler.service';
import { CryptoNewsMessageIngestedHandler } from 'telegram/crypto-news-publisher/infrastructure/event-bus/crypto-news-message-ingested.handler';
import { KeywordsController } from 'telegram/crypto-news-publisher/api/http/keywords.controller';
import { QueueController } from 'telegram/crypto-news-publisher/api/http/queue.controller';
import { BotApiCryptoNewsPublisherAdapter } from 'telegram/crypto-news-publisher/infrastructure/senders/bot-api-crypto-news-publisher.adapter';
import { CryptoNewsLlmAdapter } from 'telegram/crypto-news-publisher/infrastructure/llm/crypto-news-llm.adapter';
import { CryptoNewsPublisherConfigService } from 'telegram/crypto-news-publisher/infrastructure/config/crypto-news-publisher.config';
import { PublisherCronScheduler } from 'telegram/crypto-news-publisher/application/scheduling/publisher-cron.scheduler';
import { TelegramPublisherPort } from 'telegram/shared';
import { CryptoNewsIngestionModule } from 'telegram/ingestion/crypto-news/crypto-news-ingestion.module';

/**
 * Crypto-news publisher BC.
 *
 * Wave 4 scope adds the publishing path:
 *  - `ThrottleSchedulerService` enforces the random-delay rule
 *    between consecutive publishes (3-15 min by default).
 *  - `ProcessNextQueuedArticleUseCase` orchestrates daily-cap +
 *    throttle + LLM + publish + state transitions.
 *  - `CryptoNewsLlmAdapter` wraps the shared `LlmPort` with the
 *    crypto-news prompt template + local-image base64 encoding.
 *  - `PublisherCronScheduler` ticks every minute, gated by a
 *    Postgres advisory lock so multiple replicas don't double-drain.
 *  - `BotApiCryptoNewsPublisherAdapter` provides the real
 *    multipart `sendPhoto` implementation against the Bot API.
 *  - `CryptoNewsPublisherConfigService` loads the on-disk config
 *    (`config/crypto-news-publisher.config.json`).
 *
 * `TelegramPublisherPort` is the outbound port the use case depends
 * on; the adapter is bound to the port token below. The vip-calls
 * adapter binds the same port to a different implementation in the
 * vip-calls module — Nest resolves the binding per-module.
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
    {
      provide: TelegramPublisherPort,
      useClass: BotApiCryptoNewsPublisherAdapter,
    },
    CryptoNewsLlmAdapter,
    CryptoNewsPublisherConfigService,
    ThrottleSchedulerService,
    EnqueueMatchingMessageUseCase,
    ProcessNextQueuedArticleUseCase,
    CryptoNewsMessageIngestedHandler,
    PublisherCronScheduler,
  ],
  exports: [
    KeywordRepository,
    PublisherQueueRepository,
    PublisherThrottleStateRepository,
    TelegramPublisherPort,
    CryptoNewsLlmAdapter,
    CryptoNewsPublisherConfigService,
    ThrottleSchedulerService,
    ProcessNextQueuedArticleUseCase,
  ],
})
export class CryptoNewsPublisherModule {}
