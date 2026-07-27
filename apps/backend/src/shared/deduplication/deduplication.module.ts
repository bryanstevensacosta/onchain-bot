import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { isDatabaseEnabled } from 'shared/common/persistence/database.module';

// Domain services
import { DeduplicationService } from './application/services/deduplication.service';
import { LlmArbiterService } from './application/services/llm-arbiter.service';
import { ContentNormalizerService } from './domain/services/content-normalizer.service';
import { ContentHashService } from './domain/services/content-hash.service';
import { UrlNormalizerService } from './domain/services/url-normalizer.service';
import { SemanticScorer } from './domain/services/semantic-scorer.service';
import { DedupScorer } from './domain/services/dedup-scorer.service';
import { EmbeddingService } from './infrastructure/ml/embedding.service';

// Port
import { DeduplicationStore } from './application/ports/deduplication-store.port';

// Adapters
import { InMemoryDeduplicationStore } from './infrastructure/repositories/in-memory-deduplication.store';
import { TypeOrmDeduplicationStore } from './infrastructure/persistence/typeorm/repositories/typeorm-deduplication-store';
import { DedupRecordEntity } from './infrastructure/persistence/typeorm/entities/dedup-record.entity';

@Module({
  imports: [
    ...(isDatabaseEnabled()
      ? [TypeOrmModule.forFeature([DedupRecordEntity])]
      : []),
  ],
  providers: [
    // Domain services (always provided)
    DeduplicationService,
    LlmArbiterService,
    ContentNormalizerService,
    ContentHashService,
    UrlNormalizerService,
    SemanticScorer,
    DedupScorer,
    EmbeddingService,

    // DeduplicationStore — conditional wiring (in-memory vs TypeORM)
    InMemoryDeduplicationStore,
    ...(isDatabaseEnabled() ? [TypeOrmDeduplicationStore] : []),

    // Custom injection tokens for @Optional() interface-based DI
    // The EmbeddingService (interface) and LlmArbiterService (anonymous type)
    // in deduplication.service.ts are erased to Object at runtime, so NestJS
    // cannot resolve them by type alone. These token-based providers bridge that gap.
    {
      provide: 'EMBEDDING_SERVICE',
      useExisting: EmbeddingService,
    },
    {
      provide: 'LLM_ARBITER_SERVICE',
      useExisting: LlmArbiterService,
    },

    // Factory provider to choose the right adapter
    {
      provide: DeduplicationStore,
      inject: [
        InMemoryDeduplicationStore,
        ...(isDatabaseEnabled() ? [TypeOrmDeduplicationStore] : []),
      ],
      useFactory: (
        inMemory: InMemoryDeduplicationStore,
        typeorm?: TypeOrmDeduplicationStore,
      ): DeduplicationStore => {
        return isDatabaseEnabled() && typeorm ? typeorm : inMemory;
      },
    },
  ],
  exports: [DeduplicationService],
})
export class DeduplicationModule {}
