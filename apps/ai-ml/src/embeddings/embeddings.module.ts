import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EmbeddingCache } from './domain/embedding-cache';
import { EmbeddingsService } from './application/embeddings.service';
import { MockEmbeddingAdapter } from './infrastructure/embeddings/mock-embedding.adapter';
import { OpenAiEmbeddingAdapter } from './infrastructure/embeddings/openai-embedding.adapter';
import { LocalEmbeddingAdapter } from './infrastructure/embeddings/local-embedding.adapter';
import { EmbeddingsController } from './api/http/embeddings.controller';

/**
 * EmbeddingsModule (ai-ml, todo 2): centralized embeddings for dedup
 * + search. One interface (EmbeddingsService: model-per-call + LRU
 * cache) over three adapters (mock default, OpenAI text-embedding,
 * local all-MiniLM lazy). No TypeORM yet (GAP-1 pattern: in-memory
 * cache live, `ai_ml_embedding_cache` shape deferred).
 */
@Module({
  imports: [ConfigModule],
  controllers: [EmbeddingsController],
  providers: [
    MockEmbeddingAdapter,
    OpenAiEmbeddingAdapter,
    LocalEmbeddingAdapter,
    {
      provide: EmbeddingCache,
      useFactory: (config: ConfigService): EmbeddingCache => {
        const raw = (
          config.get<string>('EMBEDDING_CACHE_MAX_ENTRIES', '500') ?? '500'
        ).trim();
        const parsed = Number.parseInt(raw, 10);
        return new EmbeddingCache(
          Number.isFinite(parsed) && parsed > 0 ? parsed : 500,
        );
      },
      inject: [ConfigService],
    },
    EmbeddingsService,
  ],
  exports: [EmbeddingsService],
})
export class EmbeddingsModule {}
