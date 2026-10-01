import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ThreadsQueueRepository } from './ports/threads-queue.repository';
import { InMemoryThreadsQueueRepository } from './infrastructure/in-memory-threads-queue.repository';
import { EnqueueThreadsMessageUseCase } from './application/enqueue-threads-message.use-case';
import { ProcessNextThreadsArticleUseCase } from './application/process-next-threads-article.use-case';
import { ThreadsPublisherCronScheduler } from './application/threads-publisher-cron.scheduler';
import { ThreadsTokenRefresher } from './application/threads-token-refresher';
import { ThreadsMatchingEvaluator } from './application/threads-matching.evaluator';
import { ThreadsQueueController } from './api/http/threads-queue.controller';
import { ThreadsKeywordsController } from './api/http/threads-keywords.controller';
import { ThreadsBlacklistController } from './api/http/threads-blacklist.controller';
import { ThreadsLlmConfigController } from './api/http/threads-llm-config.controller';
import { ThreadsMatchingController } from './api/http/threads-matching.controller';
import { ThreadsHealthIndicator } from './health/threads-health.indicator';
import { ThreadsApiPublisherPort } from './ports/threads-api-publisher.port';
import { ThreadsApiPublisherAdapter } from './infrastructure/threads-api-publisher.adapter';

/**
 * Threads module (Meta Threads publisher, backend threads parity):
 * queue + keywords + blacklist + llm + matching + cron + refresher.
 * In-memory repos LIVE; TypeORM shapes deferred (GAP-1).
 */
@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [
    ThreadsQueueController,
    ThreadsKeywordsController,
    ThreadsBlacklistController,
    ThreadsLlmConfigController,
    ThreadsMatchingController,
  ],
  providers: [
    InMemoryThreadsQueueRepository,
    {
      provide: ThreadsQueueRepository,
      useClass: InMemoryThreadsQueueRepository,
    },
    EnqueueThreadsMessageUseCase,
    ProcessNextThreadsArticleUseCase,
    ThreadsPublisherCronScheduler,
    ThreadsTokenRefresher,
    ThreadsMatchingEvaluator,
    ThreadsHealthIndicator,
    ThreadsApiPublisherAdapter,
    {
      provide: ThreadsApiPublisherPort,
      useClass: ThreadsApiPublisherAdapter,
    },
  ],
  exports: [ThreadsQueueRepository, ThreadsHealthIndicator],
})
export class ThreadsModule {}
