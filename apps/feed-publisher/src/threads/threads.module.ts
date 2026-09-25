import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThreadRepository } from './domain/ports/thread.repository';
import { ThreadMessagePublisherPort } from './domain/ports/thread-message-publisher.port';
import { ThreadBuilderService } from './application/services/thread-builder.service';
import { ThreadSchedulerService } from './application/services/thread-scheduler.service';
import { CreateThreadUseCase } from './application/use-cases/create-thread.use-case';
import { EnqueueThreadUseCase } from './application/use-cases/enqueue-thread.use-case';
import { PublishThreadUseCase } from './application/use-cases/publish-thread.use-case';
import { ThreadPublisherCronScheduler } from './application/scheduling/thread-publisher-cron.scheduler';
import { ThreadsHealthState } from './application/state/threads-health.state';
import { InMemoryThreadRepository } from './infrastructure/persistence/in-memory/in-memory-thread.repository';
import { InMemoryThreadMessagePublisher } from './infrastructure/dispatch/in-memory-thread-message.publisher';
import { ThreadsController } from './api/http/threads.controller';
import { ThreadsHealthIndicator } from './health/threads-health.indicator';

/**
 * ThreadsModule (Tramo 2, todo 8 — v1 skeleton + C1 contract).
 *
 * Owns the thread skeleton from spec §9: `Thread` + `ThreadMessage`
 * aggregates (DRAFT->QUEUED->IN_PROGRESS->COMPLETED, PARTIAL retry
 * from `messagesPublished`, FAILED terminal, transient backoff) +
 * `ThreadBuilderService` (orchestrator) + `ThreadSchedulerService`
 * (timing/sequencing) + 3 use-cases (create/enqueue/publish) +
 * 1min cron (`THREADS_CRON_ENABLED`) + in-memory publisher (todo 7
 * binds the real Threads Bot API here) + controller answering the
 * SAME 501s the template service fixed in Tramo 1.
 *
 * v1 NEVER publishes over HTTP: the controller is a pinned stub and
 * the publisher port records in-memory. The v2 un-stubbing contract
 * lives in `src/threads/CONTRACT.md`.
 *
 * TypeORM shapes + mapper ship UNWIRED (GAP-1) with in-memory
 * adapters live (backend `DATABASE_ENABLED=false` pattern).
 */
@Module({
  imports: [ConfigModule, ScheduleModule.forRoot()],
  controllers: [ThreadsController],
  providers: [
    ThreadBuilderService,
    ThreadSchedulerService,
    CreateThreadUseCase,
    EnqueueThreadUseCase,
    PublishThreadUseCase,
    ThreadPublisherCronScheduler,
    ThreadsHealthState,
    ThreadsHealthIndicator,
    InMemoryThreadRepository,
    InMemoryThreadMessagePublisher,
    {
      provide: ThreadRepository,
      useClass: InMemoryThreadRepository,
    },
    {
      provide: ThreadMessagePublisherPort,
      useClass: InMemoryThreadMessagePublisher,
    },
  ],
  exports: [
    ThreadRepository,
    ThreadMessagePublisherPort,
    ThreadBuilderService,
    ThreadSchedulerService,
    CreateThreadUseCase,
    EnqueueThreadUseCase,
    PublishThreadUseCase,
    ThreadsHealthState,
    ThreadsHealthIndicator,
  ],
})
export class ThreadsModule {}
