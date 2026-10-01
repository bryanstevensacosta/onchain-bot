import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { AppModule } from './app.module';
import { LlmModule } from './llm/llm.module';
import { LlmPort } from './llm/application/ports/llm.port';
import { LlmConfigRepository } from './llm/domain/ports/llm-config.repository';
import { LlmController } from './llm/api/http/llm.controller';
import { PromptsModule } from './prompts/prompts.module';
import { PromptsController } from './prompts/api/http/prompts.controller';
import { PromptCatalogService } from './prompts/application/prompt-catalog.service';
import { HealthController } from './health/health.controller';

describe('AppModule (ai-ml todo 0, failing-first)', () => {
  it('wires config + health + llm gateway + auth', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        AppModule,
      ],
    }).compile();
    expect(module.get(AppModule)).toBeDefined();
    expect(module.get(LlmModule)).toBeDefined();
    expect(module.get(LlmPort)).toBeDefined();
    expect(module.get(LlmConfigRepository)).toBeDefined();
    expect(module.get(LlmController)).toBeDefined();
    expect(module.get(HealthController)).toBeDefined();
    expect(module.get(PromptsModule)).toBeDefined();
    expect(module.get(PromptsController)).toBeDefined();
    expect(module.get(PromptCatalogService)).toBeDefined();
    await module.close();
  });
});
