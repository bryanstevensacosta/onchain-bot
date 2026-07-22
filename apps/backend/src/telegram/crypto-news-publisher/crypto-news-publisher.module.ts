import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LlmPort } from 'shared/llm';
import { LlmGatewayAdapter } from 'shared/llm/adapters/llm-gateway.adapter';
import { DeduplicationModule } from 'shared/deduplication/deduplication.module';
import { BlacklistPhraseEntity } from 'telegram/crypto-news-publisher/infrastructure/persistence/typeorm/entities/blacklist-phrase.entity';
import { KeywordEntity } from 'telegram/crypto-news-publisher/infrastructure/persistence/typeorm/entities/keyword.entity';
import { LlmConfigEntity } from 'telegram/crypto-news-publisher/infrastructure/persistence/typeorm/entities/llm-config.entity';
import { PromptTemplateEntity } from 'telegram/crypto-news-publisher/infrastructure/persistence/typeorm/entities/prompt-template.entity';
import { PublisherQueueEntity } from 'telegram/crypto-news-publisher/infrastructure/persistence/typeorm/entities/publisher-queue.entity';
import { PublisherThrottleStateEntity } from 'telegram/crypto-news-publisher/infrastructure/persistence/typeorm/entities/publisher-throttle-state.entity';
import { BlacklistPhraseRepository } from 'telegram/crypto-news-publisher/application/ports/blacklist-phrase.repository';
import { KeywordRepository } from 'telegram/crypto-news-publisher/application/ports/keyword.repository';
import { LlmConfigRepository } from 'telegram/crypto-news-publisher/application/ports/llm-config.repository';
import { PromptTemplateRepository } from 'telegram/crypto-news-publisher/application/ports/prompt-template.repository';
import { PublisherQueueRepository } from 'telegram/crypto-news-publisher/application/ports/publisher-queue.repository';
import { PublisherThrottleStateRepository } from 'telegram/crypto-news-publisher/application/ports/publisher-throttle-state.repository';
import { TypeOrmBlacklistPhraseRepository } from 'telegram/crypto-news-publisher/infrastructure/persistence/typeorm/repositories/typeorm-blacklist-phrase.repository';
import { TypeOrmKeywordRepository } from 'telegram/crypto-news-publisher/infrastructure/persistence/typeorm/repositories/typeorm-keyword.repository';
import { TypeOrmLlmConfigRepository } from 'telegram/crypto-news-publisher/infrastructure/persistence/typeorm/repositories/typeorm-llm-config.repository';
import { TypeOrmPromptTemplateRepository } from 'telegram/crypto-news-publisher/infrastructure/persistence/typeorm/repositories/typeorm-prompt-template.repository';
import { TypeOrmPublisherQueueRepository } from 'telegram/crypto-news-publisher/infrastructure/persistence/typeorm/repositories/typeorm-publisher-queue.repository';
import { TypeOrmPublisherThrottleStateRepository } from 'telegram/crypto-news-publisher/infrastructure/persistence/typeorm/repositories/typeorm-publisher-throttle-state.repository';
import { EnqueueMatchingMessageUseCase } from 'telegram/crypto-news-publisher/application/handlers/enqueue-matching-message.use-case';
import { ProcessNextQueuedArticleUseCase } from 'telegram/crypto-news-publisher/application/handlers/process-next-queued-article.use-case';
import { GetLlmModelsUseCase } from 'telegram/crypto-news-publisher/application/handlers/get-llm-models.use-case';
import { ThrottleSchedulerService } from 'telegram/crypto-news-publisher/application/services/throttle-scheduler.service';
import { CryptoNewsMessageIngestedHandler } from 'telegram/crypto-news-publisher/infrastructure/event-bus/crypto-news-message-ingested.handler';
import { BlacklistController } from 'telegram/crypto-news-publisher/api/http/blacklist.controller';
import { KeywordsController } from 'telegram/crypto-news-publisher/api/http/keywords.controller';
import { QueueController } from 'telegram/crypto-news-publisher/api/http/queue.controller';
import { LlmConfigController } from 'telegram/crypto-news-publisher/api/http/llm-config.controller';
import { BotApiCryptoNewsPublisherAdapter } from 'telegram/crypto-news-publisher/infrastructure/senders/bot-api-crypto-news-publisher.adapter';
import { CryptoNewsLlmAdapter } from 'telegram/crypto-news-publisher/infrastructure/llm/crypto-news-llm.adapter';
import { CryptoNewsPublisherConfigService } from 'telegram/crypto-news-publisher/infrastructure/config/crypto-news-publisher.config';
import { LlmConfigMigrationService } from 'telegram/crypto-news-publisher/infrastructure/migration/llm-config-migration.service';
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
      BlacklistPhraseEntity,
      KeywordEntity,
      LlmConfigEntity,
      PromptTemplateEntity,
      PublisherQueueEntity,
      PublisherThrottleStateEntity,
    ]),
    CryptoNewsIngestionModule,
    DeduplicationModule,
  ],
  controllers: [
    BlacklistController,
    KeywordsController,
    QueueController,
    LlmConfigController,
  ],
  providers: [
    TypeOrmBlacklistPhraseRepository,
    TypeOrmKeywordRepository,
    TypeOrmLlmConfigRepository,
    TypeOrmPromptTemplateRepository,
    TypeOrmPublisherQueueRepository,
    TypeOrmPublisherThrottleStateRepository,
    {
      provide: BlacklistPhraseRepository,
      useClass: TypeOrmBlacklistPhraseRepository,
    },
    {
      provide: KeywordRepository,
      useClass: TypeOrmKeywordRepository,
    },
    {
      provide: LlmConfigRepository,
      useClass: TypeOrmLlmConfigRepository,
    },
    {
      provide: PromptTemplateRepository,
      useClass: TypeOrmPromptTemplateRepository,
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
    // Overrides the globally-bound `LlmPort` from `LlmModule` for
    // crypto-news-publisher only; other BCs keep using OpenAI/Mock.
    {
      provide: LlmPort,
      useClass: LlmGatewayAdapter,
    },
    CryptoNewsLlmAdapter,
    CryptoNewsPublisherConfigService,
    LlmConfigMigrationService,
    ThrottleSchedulerService,
    EnqueueMatchingMessageUseCase,
    ProcessNextQueuedArticleUseCase,
    GetLlmModelsUseCase,
    CryptoNewsMessageIngestedHandler,
    PublisherCronScheduler,
  ],
  exports: [
    BlacklistPhraseRepository,
    KeywordRepository,
    LlmConfigRepository,
    PromptTemplateRepository,
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
