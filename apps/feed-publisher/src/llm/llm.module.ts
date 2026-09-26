import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { KeywordsModule } from '../keywords/keywords.module';
import { MatchingModule } from '../matching/matching.module';
import { AiMlModule } from '../ai-ml/ai-ml.module';
import {
  DualLlmAdapter,
  LOCAL_LLM_PORT,
} from '../ai-ml/application/services/dual-llm.adapter';
import { LlmConfigRepository } from './domain/ports/llm-config.repository';
import { PromptTemplateRepository } from './domain/ports/prompt-template.repository';
import { LlmPort } from './application/ports/llm.port';
import { MockLlmAdapter } from './infrastructure/llm/mock-llm.adapter';
import { LlmGatewayAdapter } from './infrastructure/llm/llm-gateway.adapter';
import { FeedLlmGenerator } from './infrastructure/llm/feed-llm-generator.adapter';
import { LlmArticleRendererAdapter } from './infrastructure/llm/llm-article-renderer.adapter';
import { InMemoryLlmConfigRepository } from './infrastructure/persistence/in-memory/in-memory-llm-config.repository';
import { InMemoryPromptTemplateRepository } from './infrastructure/persistence/in-memory/in-memory-prompt-template.repository';
import { GetPipelineFlagsUseCase } from './application/use-cases/get-pipeline-flags.use-case';
import { GetLlmModelsUseCase } from './application/use-cases/get-llm-models.use-case';
import { PreviewPromptUseCase } from './application/use-cases/preview-prompt.use-case';
import { LlmConfigController } from './api/http/llm-config.controller';
import { PromptTemplatesController } from './api/http/prompt-templates.controller';
import { LlmPlaygroundController } from './api/http/llm-playground.controller';
import { LlmHealthIndicator } from './health/llm-health.indicator';

/**
 * LlmModule (Tramo 2, todo 5; ai-ml dual-run since ai-ml todo 3).
 *
 * Owns the feed LLM stack: single-row `LlmConfig` (llm/publishing
 * switches; matching lives in the matching module) + GLOBAL
 * `PromptTemplate` catalog (`global` rows reusable across content
 * types) + `FeedLlmGenerator` (keyword-bound > default resolution,
 * single-pass `{{title}}/{{original}}/{{hasImage}}` render, vision
 * fail-open, mock short-circuit, LlmFailedError wrap) +
 * `LlmArticleRendererAdapter` (drain-path flags + non-Latin guard, the
 * LIVE `QueuedArticleRendererPort` binding since todo 5) +
 * `PreviewPromptUseCase` (side-effect-free playground) + 3
 * controllers (`/api/llm` config/flags, `/api/llm/templates`,
 * `/api/llm/preview` + `/api/llm/models`) + `LlmHealthIndicator`
 * (P21 hook). TypeORM shapes + mappers ship unwired (GAP-1) with
 * in-memory adapters live.
 *
 * @deprecated Local serving leg only (ai-ml todo 4 cutover):
 * `LlmPort` resolves to `DualLlmAdapter` over
 * `FEED_AI_ML_MODE=local|dual|ai-ml` (default `ai-ml` — ai-ml serves,
 * fail-closed; `local|dual` are rollback/shadow only). New generation
 * code must call ai-ml over HTTP; the in-process gateway/mock
 * adapters are dual-leg only and scheduled for removal.
 */
@Module({
  imports: [
    ConfigModule,
    KeywordsModule,
    forwardRef(() => MatchingModule),
    AiMlModule,
  ],
  controllers: [LlmConfigController, PromptTemplatesController, LlmPlaygroundController],
  providers: [
    MockLlmAdapter,
    LlmGatewayAdapter,
    {
      // Legacy local leg (mock | gateway) — serves only via DualLlmAdapter now.
      provide: LOCAL_LLM_PORT,
      useFactory: (mock: MockLlmAdapter, gateway: LlmGatewayAdapter): LlmPort =>
        process.env.USE_MOCK_AI === 'true' ? mock : gateway,
      inject: [MockLlmAdapter, LlmGatewayAdapter],
    },
    DualLlmAdapter,
    {
      provide: LlmPort,
      useExisting: DualLlmAdapter,
    },
    FeedLlmGenerator,
    LlmArticleRendererAdapter,
    GetPipelineFlagsUseCase,
    GetLlmModelsUseCase,
    PreviewPromptUseCase,
    LlmHealthIndicator,
    InMemoryLlmConfigRepository,
    InMemoryPromptTemplateRepository,
    {
      provide: LlmConfigRepository,
      useClass: InMemoryLlmConfigRepository,
    },
    {
      provide: PromptTemplateRepository,
      useClass: InMemoryPromptTemplateRepository,
    },
  ],
  exports: [
    LlmConfigRepository,
    PromptTemplateRepository,
    LlmPort,
    FeedLlmGenerator,
    LlmArticleRendererAdapter,
    GetPipelineFlagsUseCase,
    PreviewPromptUseCase,
    GetLlmModelsUseCase,
    LlmHealthIndicator,
  ],
})
export class LlmModule {}
