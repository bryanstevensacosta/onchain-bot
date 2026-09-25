import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { IngestionModule } from '../ingestion/ingestion.module';
import { KeywordsModule } from '../keywords/keywords.module';
import { FiltersModule } from '../filters/filters.module';
import { QueueModule } from '../queue/queue.module';
import { QueueMatchedMessageAdapter } from '../queue/infrastructure/feed/queue-matched-message.adapter';
import { MatchingConfigRepository } from './domain/ports/matching-config.repository';
import { FeedPort } from './domain/ports/feed.port';
import { MatchedMessageEnqueuePort } from './domain/ports/matched-message-enqueue.port';
import { MatchingEvaluator } from './application/services/matching-evaluator.service';
import { FilteredFeedService } from './application/services/filtered-feed.service';
import { EvaluateMessageMatchUseCase } from './application/use-cases/evaluate-message-match.use-case';
import { EnqueueMatchingCronScheduler } from './application/scheduling/enqueue-matching-cron.scheduler';
import { MatchingHealthState } from './application/state/matching-health.state';
import { InMemoryMatchingConfigRepository } from './infrastructure/persistence/in-memory/in-memory-matching-config.repository';
import { IngestionFeedAdapter } from './infrastructure/feed/ingestion-feed.adapter';
import { InMemoryMatchedMessageCollector } from './infrastructure/feed/in-memory-matched-message.collector';
import { MatchingConfigController } from './api/http/matching-config.controller';
import { MatchingHealthIndicator } from './health/matching-health.indicator';

/**
 * MatchingModule (Tramo 2, todo 3).
 *
 * Owns FilteredFeedService + MatchingEvaluator +
 * EvaluateMessageMatchUseCase + EnqueueMatchingCronScheduler + the
 * single-row MatchingConfig. Feed rows are typed crypto-only; foreign
 * feed types are dropped client-side (P10). Threads never route through
 * matching (direct to queue in todo 4). `MatchedMessageEnqueuePort`
 * binds the unified queue since todo 4 (the in-memory collector remains
 * as a test double only); the TypeORM shapes ship unwired (GAP-1).
 */
@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    forwardRef(() => IngestionModule),
    forwardRef(() => QueueModule),
    KeywordsModule,
    FiltersModule,
  ],
  controllers: [MatchingConfigController],
  providers: [
    MatchingEvaluator,
    FilteredFeedService,
    EvaluateMessageMatchUseCase,
    EnqueueMatchingCronScheduler,
    MatchingHealthState,
    MatchingHealthIndicator,
    InMemoryMatchedMessageCollector,
    {
      provide: MatchingConfigRepository,
      useClass: InMemoryMatchingConfigRepository,
    },
    {
      provide: FeedPort,
      useClass: IngestionFeedAdapter,
    },
    {
      provide: MatchedMessageEnqueuePort,
      useClass: QueueMatchedMessageAdapter,
    },
  ],
  exports: [
    MatchingConfigRepository,
    FeedPort,
    MatchedMessageEnqueuePort,
    FilteredFeedService,
    MatchingEvaluator,
    EvaluateMessageMatchUseCase,
    MatchingHealthState,
    MatchingHealthIndicator,
    InMemoryMatchedMessageCollector,
  ],
})
export class MatchingModule {}
