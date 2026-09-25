import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { LlmModule } from './llm.module';
import { LlmConfigController } from './api/http/llm-config.controller';
import { PromptTemplatesController } from './api/http/prompt-templates.controller';
import { LlmPlaygroundController } from './api/http/llm-playground.controller';
import { LlmConfigRepository } from './domain/ports/llm-config.repository';
import { PromptTemplateRepository } from './domain/ports/prompt-template.repository';
import { LlmPort } from './application/ports/llm.port';
import { FeedLlmGenerator } from './infrastructure/llm/feed-llm-generator.adapter';
import { LlmArticleRendererAdapter } from './infrastructure/llm/llm-article-renderer.adapter';
import { PreviewPromptUseCase } from './application/use-cases/preview-prompt.use-case';
import { GetLlmModelsUseCase } from './application/use-cases/get-llm-models.use-case';
import { GetPipelineFlagsUseCase } from './application/use-cases/get-pipeline-flags.use-case';
import { LlmHealthIndicator } from './health/llm-health.indicator';

describe('LlmModule', () => {
  it('wires config + templates + playground + health (todo 5)', async () => {
    const module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), LlmModule],
    }).compile();
    expect(module.get(LlmModule)).toBeDefined();
    expect(module.get(LlmConfigController)).toBeDefined();
    expect(module.get(PromptTemplatesController)).toBeDefined();
    expect(module.get(LlmPlaygroundController)).toBeDefined();
    expect(module.get(LlmConfigRepository)).toBeDefined();
    expect(module.get(PromptTemplateRepository)).toBeDefined();
    expect(module.get(LlmPort)).toBeDefined();
    expect(module.get(FeedLlmGenerator)).toBeDefined();
    expect(module.get(LlmArticleRendererAdapter)).toBeDefined();
    expect(module.get(PreviewPromptUseCase)).toBeDefined();
    expect(module.get(GetLlmModelsUseCase)).toBeDefined();
    expect(module.get(GetPipelineFlagsUseCase)).toBeDefined();
    expect(module.get(LlmHealthIndicator)).toBeDefined();
    await module.close();
  });
});
