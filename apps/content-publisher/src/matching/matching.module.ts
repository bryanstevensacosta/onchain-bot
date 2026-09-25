import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { IngestionModule } from '../ingestion/ingestion.module';
import { KeywordsModule } from '../keywords/keywords.module';
import { FiltersModule } from '../filters/filters.module';
import { MatchingConfigRepository } from './domain/ports/matching-config.repository';
import { CryptoNewsFeedPort } from './domain/ports/crypto-news-feed.port';
import { MatchedMessageEnqueuePort } from './domain/ports/matched-message-enqueue.port';
import { MatchingEvaluator } from './application/services/matching-evaluator.service';
import { FilteredCryptoNewsService } from './application/services/filtered-crypto-news.service';
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
 * Owns FilteredCryptoNewsService + MatchingEvaluator +
 * EvaluateMessageMatchUseCase + EnqueueMatchingCronScheduler + the
 * single-row MatchingConfig. Feed rows are typed crypto-only; foreign
 * feed types are dropped client-side (P10). Threads never route through
 * matching (direct to queue in todo 4). Live bindings are in-memory
 * (repos + collector); the TypeORM shapes ship unwired (GAP-1).
 */
@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    forwardRef(() => IngestionModule),
    KeywordsModule,
    FiltersModule,
  ],
  controllers: [MatchingConfigController],
  providers: [
    MatchingEvaluator,
    FilteredCryptoNewsService,
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
      provide: CryptoNewsFeedPort,
      useClass: IngestionFeedAdapter,
    },
    {
      provide: MatchedMessageEnqueuePort,
      useClass: InMemoryMatchedMessageCollector,
    },
  ],
  exports: [
    MatchingConfigRepository,
    CryptoNewsFeedPort,
    MatchedMessageEnqueuePort,
    FilteredCryptoNewsService,
    MatchingEvaluator,
    EvaluateMessageMatchUseCase,
    MatchingHealthState,
    MatchingHealthIndicator,
    InMemoryMatchedMessageCollector,
  ],
})
export class MatchingModule {}
