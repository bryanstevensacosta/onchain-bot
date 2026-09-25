import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { DeduplicationModule } from '../deduplication/deduplication.module';
import { PublisherQueueRepository } from './domain/ports/publisher-queue.repository';
import { QueuedArticleRendererPort } from './application/ports/queued-article-renderer.port';
import { QueuedArticleDispatcherPort } from './application/ports/queued-article-dispatcher.port';
import { QueueManager } from './application/services/queue-manager.service';
import { EnqueueMatchingMessageUseCase } from './application/use-cases/enqueue-matching-message.use-case';
import { ProcessNextQueuedArticleUseCase } from './application/use-cases/process-next-queued-article.use-case';
import { PublisherCronScheduler } from './application/scheduling/publisher-cron.scheduler';
import { ExpireStaleQueueEntriesScheduler } from './application/scheduling/expire-stale-queue-entries.scheduler';
import { QueueHealthState } from './application/state/queue-health.state';
import { QueueMatchedMessageAdapter } from './infrastructure/feed/queue-matched-message.adapter';
import { RawContentRendererAdapter } from './infrastructure/render/raw-content-renderer.adapter';
import { InMemoryQueuedArticleDispatcher } from './infrastructure/dispatch/in-memory-queued-article.dispatcher';
import { InMemoryPublisherQueueRepository } from './infrastructure/persistence/in-memory/in-memory-publisher-queue.repository';
import { QueueController } from './api/http/queue.controller';
import { QueueHealthIndicator } from './health/queue-health.indicator';

/**
 * QueueModule (Tramo 2, todo 4).
 *
 * Owns the unified queue (`contentType` discriminator): PublisherQueueEntry
 * + QueueManager (strict `QUEUE_MAX_PENDING` cap, default 36) +
 * EnqueueMatchingMessage (binds the todo 3 `MatchedMessageEnqueuePort`) +
 * ProcessNextQueuedArticle (one-per-tick drain, raw render + in-memory
 * dispatch until todos 5/7) + schedulers (1min drain + 30min TTL expire,
 * default 24h) + `GET/DELETE /api/queue`. The TypeORM shape + mapper ship
 * unwired (GAP-1); BullMQ-over-Redis replaces the in-memory repo (GAP-3)
 * without touching QueueManager.
 */
@Module({
  imports: [ConfigModule, ScheduleModule.forRoot(), DeduplicationModule],
  controllers: [QueueController],
  providers: [
    QueueManager,
    EnqueueMatchingMessageUseCase,
    ProcessNextQueuedArticleUseCase,
    PublisherCronScheduler,
    ExpireStaleQueueEntriesScheduler,
    QueueHealthState,
    QueueHealthIndicator,
    QueueMatchedMessageAdapter,
    RawContentRendererAdapter,
    InMemoryQueuedArticleDispatcher,
    InMemoryPublisherQueueRepository,
    {
      provide: PublisherQueueRepository,
      useClass: InMemoryPublisherQueueRepository,
    },
    {
      provide: QueuedArticleRendererPort,
      useClass: RawContentRendererAdapter,
    },
    {
      provide: QueuedArticleDispatcherPort,
      useClass: InMemoryQueuedArticleDispatcher,
    },
  ],
  exports: [
    QueueManager,
    PublisherQueueRepository,
    EnqueueMatchingMessageUseCase,
    ProcessNextQueuedArticleUseCase,
    QueuedArticleRendererPort,
    QueuedArticleDispatcherPort,
    QueueMatchedMessageAdapter,
    QueueHealthState,
    QueueHealthIndicator,
  ],
})
export class QueueModule {}
