import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiMlParityService } from './application/services/ai-ml-parity.service';
import { AiMlEmbeddingClientAdapter } from './infrastructure/ai-ml-embedding-client.adapter';
import { AiMlLlmClientAdapter } from './infrastructure/ai-ml-llm-client.adapter';
import { AiMlPromptClient } from './infrastructure/ai-ml-prompt-client';
import { AiMlStatusController } from './api/http/ai-ml-status.controller';
import { AiMlHealthIndicator } from './health/ai-ml-health.indicator';

/**
 * AiMlModule (ai-ml plan todo 3): feed-publisher as an ai-ml HTTP client.
 *
 * Remote legs (`AiMlLlmClientAdapter` → `POST /api/llm/generate`,
 * `AiMlEmbeddingClientAdapter` → `POST /api/embeddings/embed`,
 * `AiMlPromptClient` → `POST /api/prompts/resolve`) + the dual-run
 * parity ledger (`AiMlParityService` + `assertNoDivergence` cutover
 * gate) + `GET /api/ai-ml/status` + the P21 `AiMlHealthIndicator`.
 *
 * No dependency on `LlmModule`/`DeduplicationModule` (one-directional
 * imports only): those modules import this one, bind their local legs
 * under `LOCAL_LLM_PORT` / `LOCAL_EMBEDDING_PORT`, and provide the
 * dual adapters (`DualLlmAdapter` lives on the `LlmPort` token,
 * `DualEmbeddingAdapter` on the `EmbeddingPort` token).
 */
@Module({
  imports: [ConfigModule],
  controllers: [AiMlStatusController],
  providers: [
    AiMlParityService,
    AiMlLlmClientAdapter,
    AiMlEmbeddingClientAdapter,
    AiMlPromptClient,
    AiMlHealthIndicator,
  ],
  exports: [
    AiMlParityService,
    AiMlLlmClientAdapter,
    AiMlEmbeddingClientAdapter,
    AiMlPromptClient,
    AiMlHealthIndicator,
  ],
})
export class AiMlModule {}
