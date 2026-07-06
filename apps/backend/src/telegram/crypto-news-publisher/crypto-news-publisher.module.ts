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

/**
 * Crypto-news publisher BC.
 *
 * Wave 2 scope: domain entities, ports, TypeORM infrastructure, and
 * the module wiring. NO controllers, event handlers, use cases or
 * schedulers yet — those land in Wave 3 (event-driven ingestion) and
 * Wave 4 (cron publisher).
 *
 * The 3 TypeORM entities (`KeywordEntity`, `PublisherQueueEntity`,
 * `PublisherThrottleStateEntity`) are registered with `forFeature` so
 * the `InjectRepository(...)` decorators inside the repos resolve at
 * runtime. Repos are exported via the abstract port tokens
 * (`KeywordRepository`, `PublisherQueueRepository`,
 * `PublisherThrottleStateRepository`).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      KeywordEntity,
      PublisherQueueEntity,
      PublisherThrottleStateEntity,
    ]),
  ],
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
  ],
  exports: [
    KeywordRepository,
    PublisherQueueRepository,
    PublisherThrottleStateRepository,
  ],
})
export class CryptoNewsPublisherModule {}
