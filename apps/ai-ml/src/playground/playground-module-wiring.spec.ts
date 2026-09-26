import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { LlmModule } from '../llm/llm.module';
import { PromptsModule } from '../prompts/prompts.module';
import { PlaygroundModule } from './playground.module';
import { PreviewPlaygroundUseCase } from './application/preview-playground.use-case';
import { PlaygroundController } from './api/http/playground.controller';

describe('PlaygroundModule (ai-ml todo 2, failing-first)', () => {
  it('wires preview over the prompts catalog + LLM gateway', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        LlmModule,
        PromptsModule,
        PlaygroundModule,
      ],
    }).compile();
    expect(module.get(PlaygroundModule)).toBeDefined();
    expect(module.get(PreviewPlaygroundUseCase)).toBeDefined();
    expect(module.get(PlaygroundController)).toBeDefined();
    await module.close();
  });
});
