import { Module, forwardRef } from '@nestjs/common';
import { LlmPort } from 'shared/llm';
import { LlmGatewayAdapter } from 'shared/llm/adapters/llm-gateway.adapter';
import { DeduplicationModule } from 'shared/deduplication/deduplication.module';
import {
  SHARED_THROTTLE_BOUNDS,
  SharedThrottleSchedulerService,
} from 'telegram/shared/application/services/shared-throttle-scheduler.service';
import { SharedThrottleStateRepository } from 'telegram/shared/application/ports/shared-throttle-state.repository';
import { ThreadsQueueRepository } from 'threads/publisher/application/ports/threads-queue.repository';
import { ThreadsLlmConfigRepository } from 'threads/publisher/application/ports/threads-llm-config.repository';
import { ThreadsThrottleStateRepository } from 'threads/publisher/application/ports/threads-throttle-state.repository';
import { ThreadsKeywordRepository } from 'threads/publisher/application/ports/threads-keyword.repository';
import { ThreadsBlacklistPhraseRepository } from 'threads/publisher/application/ports/threads-blacklist-phrase.repository';
import { ThreadsPromptTemplateRepository } from 'threads/publisher/application/ports/threads-prompt-template.repository';
import { ThreadsApiPublisherPort } from 'threads/publisher/application/ports/threads-api-publisher.port';
import { ThreadsApiPublisherAdapter } from 'threads/publisher/infrastructure/senders/threads-api-publisher.adapter';
import { InMemoryThreadsQueueRepository } from 'threads/publisher/application/repositories/in-memory-threads-queue.repository';
import { InMemoryThreadsLlmConfigRepository } from 'threads/publisher/application/repositories/in-memory-threads-llm-config.repository';
import { InMemoryThreadsThrottleStateRepository } from 'threads/publisher/application/repositories/in-memory-threads-throttle-state.repository';
import { InMemoryThreadsPromptTemplateRepository } from 'threads/publisher/application/repositories/in-memory-threads-prompt-template.repository';
import { ThreadsLlmAdapter } from 'threads/publisher/infrastructure/llm/threads-llm.adapter';
import { InMemoryThreadsKeywordRepository } from 'threads/publisher/application/repositories/in-memory-threads-keyword.repository';
import { InMemoryThreadsBlacklistPhraseRepository } from 'threads/publisher/application/repositories/in-memory-threads-blacklist-phrase.repository';
import { ThreadsPhraseRegistryService } from 'threads/publisher/application/services/threads-phrase-registry.service';
import { GetThreadsLlmModelsUseCase } from 'threads/publisher/application/handlers/get-threads-llm-models.use-case';
import { ThreadsKeywordsController } from 'threads/publisher/api/http/keywords.controller';
import { ThreadsBlacklistController } from 'threads/publisher/api/http/blacklist.controller';
import { ThreadsPhrasesController } from 'threads/publisher/api/http/phrases.controller';
import { ThreadsQueueController } from 'threads/publisher/api/http/queue.controller';
import { ThreadsLlmConfigController } from 'threads/publisher/api/http/llm-config.controller';
import { ThreadsThrottleBridgeRepository } from 'threads/publisher/application/services/threads-throttle-bridge.repository';
import { EnqueueThreadsMessageUseCase } from 'threads/publisher/application/handlers/enqueue-threads-message.use-case';
import { ProcessNextThreadsArticleUseCase } from 'threads/publisher/application/handlers/process-next-threads-article.use-case';
import { ThreadsPublisherCronScheduler } from 'threads/publisher/application/scheduling/threads-publisher-cron.scheduler';
import { ExpireStaleThreadsScheduler } from 'threads/publisher/application/scheduling/expire-stale-threads.scheduler';

/**
 * Threads publisher BC (T2 application core).
 *
 * Wiring mirrors `CryptoNewsPublisherModule` (dedup `forwardRef` +
 * shared `LlmPort` left on the global binding + per-module
 * `SHARED_THROTTLE_BOUNDS` factory):
 * - Throttle window 60s–300s (Threads cadence, NOT the 1msg/min
 *   Bot-API rule and NOT the crypto-news 3–15min window).
 * - `SharedThrottleSchedulerService` is the SAME class crypto-news
 *   uses, fed by the Threads row through
 *   `ThreadsThrottleBridgeRepository`.
 * - `LlmPort` resolves from the global `LlmModule` binding
 *   (real/mock by env) — no per-module override in T2.
 *
 * T6 extension (adapter + seed + wiring — T2/T3 providers untouched):
 * - `LlmPort` is overridden per-module with `LlmGatewayAdapter`
 *   (mirror of `crypto-news-publisher.module.ts:150-153`; other BCs
 *   keep the global binding). T2's `ProcessNextThreadsArticleUseCase`
 *   keeps calling the SAME `LlmPort` token with its inline prompt —
 *   that call path is intact; `ThreadsLlmAdapter` is the canonical
 *   prompt owner for NEW callers.
 * - `ThreadsPromptTemplateRepository` binds the in-memory repo
 *   pre-seeded with the `threads-default` template.
 * - `GetThreadsLlmModelsUseCase` (T4, Threads-typed mirror of the
 *   crypto-news `GetLlmModelsUseCase`) serves the UI model
 *   dropdown: the shared class would have sufficed (zero
 *   crypto-news imports), but T4's scoped mirror keeps the threads
 *   controller free of cross-BC imports — T6 defers to it.
 */
@Module({
  imports: [forwardRef(() => DeduplicationModule)],
  controllers: [
    ThreadsKeywordsController,
    ThreadsBlacklistController,
    ThreadsPhrasesController,
    ThreadsQueueController,
    ThreadsLlmConfigController,
  ],
  providers: [
    InMemoryThreadsQueueRepository,
    InMemoryThreadsLlmConfigRepository,
    InMemoryThreadsThrottleStateRepository,
    InMemoryThreadsKeywordRepository,
    InMemoryThreadsBlacklistPhraseRepository,
    InMemoryThreadsPromptTemplateRepository,
    {
      provide: ThreadsQueueRepository,
      useClass: InMemoryThreadsQueueRepository,
    },
    {
      provide: ThreadsLlmConfigRepository,
      useClass: InMemoryThreadsLlmConfigRepository,
    },
    {
      provide: ThreadsThrottleStateRepository,
      useClass: InMemoryThreadsThrottleStateRepository,
    },
    {
      provide: ThreadsKeywordRepository,
      useClass: InMemoryThreadsKeywordRepository,
    },
    {
      provide: ThreadsBlacklistPhraseRepository,
      useClass: InMemoryThreadsBlacklistPhraseRepository,
    },
    {
      provide: ThreadsPromptTemplateRepository,
      useClass: InMemoryThreadsPromptTemplateRepository,
    },
    ThreadsPhraseRegistryService,
    GetThreadsLlmModelsUseCase,
    ThreadsThrottleBridgeRepository,
    {
      provide: SharedThrottleStateRepository,
      useExisting: ThreadsThrottleBridgeRepository,
    },
    {
      provide: SHARED_THROTTLE_BOUNDS,
      useValue: { minDelayMs: 60_000, maxDelayMs: 300_000 },
    },
    {
      provide: ThreadsApiPublisherPort,
      useClass: ThreadsApiPublisherAdapter,
    },
    // Overrides the globally-bound `LlmPort` from `LlmModule` for
    // threads-publisher only; other BCs keep using OpenAI/Mock.
    // (Mirror of crypto-news-publisher.module.ts:150-153.)
    {
      provide: LlmPort,
      useClass: LlmGatewayAdapter,
    },
    ThreadsLlmAdapter,
    SharedThrottleSchedulerService,
    EnqueueThreadsMessageUseCase,
    ProcessNextThreadsArticleUseCase,
    ThreadsPublisherCronScheduler,
    ExpireStaleThreadsScheduler,
  ],
  exports: [
    ThreadsQueueRepository,
    ThreadsLlmConfigRepository,
    ThreadsThrottleStateRepository,
    ThreadsKeywordRepository,
    ThreadsBlacklistPhraseRepository,
    ThreadsPromptTemplateRepository,
    ThreadsApiPublisherPort,
    SharedThrottleSchedulerService,
    EnqueueThreadsMessageUseCase,
    ProcessNextThreadsArticleUseCase,
  ],
})
export class ThreadsPublisherModule {}
