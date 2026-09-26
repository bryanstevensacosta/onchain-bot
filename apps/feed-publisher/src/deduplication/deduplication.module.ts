import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AiMlModule } from '../ai-ml/ai-ml.module';
import {
  DualEmbeddingAdapter,
  LOCAL_EMBEDDING_PORT,
} from '../ai-ml/application/services/dual-embedding.adapter';
import { DeduplicationStorePort } from './domain/ports/deduplication-store.port';
import { EmbeddingPort } from './application/ports/embedding.port';
import { ContentNormalizerService } from './application/services/content-normalizer.service';
import { UrlNormalizerService } from './application/services/url-normalizer.service';
import { ContentHashService } from './application/services/content-hash.service';
import { DedupScorerService } from './application/services/dedup-scorer.service';
import { SemanticScorerService } from './application/services/semantic-scorer.service';
import { DeduplicationService } from './application/services/deduplication.service';
import { InMemoryDeduplicationStore } from './infrastructure/repositories/in-memory-deduplication.store';
import { MockEmbeddingAdapter } from './infrastructure/ml/mock-embedding.adapter';
import { OpenAiEmbeddingAdapter } from './infrastructure/ml/openai-embedding.adapter';
import { DeduplicationHealthIndicator } from './health/deduplication-health.indicator';

/**
 * DeduplicationModule (Tramo 2, todo 4; ai-ml dual-run since ai-ml todo 3).
 *
 * Owns the DeduplicationService cascade (exact -> content -> semantic,
 * fail-open) + normalizers + scorers + embeddings. Embedding serving
 * is dual: `EmbeddingPort` resolves to `DualEmbeddingAdapter` over
 * `FEED_AI_ML_MODE=local|dual|ai-ml` (default `dual` — local serves,
 * ai-ml compares).
 *
 * @deprecated Local serving leg only (ai-ml todo 3 dual-run). New
 * embedding code must call ai-ml over HTTP; the in-process OpenAI/mock
 * adapters are removed at ai-ml todo 4.
 * Storage decision: plain `dedup_fingerprints` table (NO pgvector —
 * vetoable in review); the TypeORM shape + mapper ship unwired (GAP-1)
 * with the in-memory store live.
 */
@Module({
  imports: [ConfigModule, AiMlModule],
  providers: [
    ContentNormalizerService,
    UrlNormalizerService,
    ContentHashService,
    DedupScorerService,
    SemanticScorerService,
    DeduplicationService,
    DeduplicationHealthIndicator,
    InMemoryDeduplicationStore,
    MockEmbeddingAdapter,
    OpenAiEmbeddingAdapter,
    {
      provide: DeduplicationStorePort,
      useClass: InMemoryDeduplicationStore,
    },
    {
      // Legacy local leg (OpenAI | mock) — serves only via DualEmbeddingAdapter now.
      provide: LOCAL_EMBEDDING_PORT,
      useFactory: (
        config: ConfigService,
        mock: MockEmbeddingAdapter,
        openai: OpenAiEmbeddingAdapter,
      ): EmbeddingPort => {
        const mockMode = config.get<string>('USE_MOCK_AI', 'true') === 'true';
        const apiKey = config.get<string>('OPENAI_API_KEY');
        if (!mockMode && apiKey !== undefined && apiKey !== '') {
          return openai;
        }
        return mock;
      },
      inject: [ConfigService, MockEmbeddingAdapter, OpenAiEmbeddingAdapter],
    },
    DualEmbeddingAdapter,
    {
      provide: EmbeddingPort,
      useExisting: DualEmbeddingAdapter,
    },
  ],
  exports: [
    DeduplicationService,
    DeduplicationStorePort,
    EmbeddingPort,
    ContentNormalizerService,
    UrlNormalizerService,
    ContentHashService,
    DedupScorerService,
    SemanticScorerService,
    DeduplicationHealthIndicator,
  ],
})
export class DeduplicationModule {}
