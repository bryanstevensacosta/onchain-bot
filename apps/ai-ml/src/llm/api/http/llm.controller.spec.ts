import { ConfigService } from '@nestjs/config';
import { MockLlmAdapter } from '@/llm/infrastructure/llm/mock-llm.adapter';
import { InMemoryLlmConfigRepository } from '@/llm/infrastructure/persistence/in-memory/in-memory-llm-config.repository';
import { UsageAuditService } from '@/llm/application/usage-audit.service';
import { GenerateTextUseCase } from '@/llm/application/use-cases/generate-text.use-case';
import { GetLlmModelsUseCase } from '@/llm/application/use-cases/get-llm-models.use-case';
import { GetPipelineFlagsUseCase } from '@/llm/application/use-cases/get-pipeline-flags.use-case';
import { LlmController } from './llm.controller';

const buildController = (): LlmController => {
  const mock = new MockLlmAdapter();
  const config = new ConfigService({ LLM_MODEL: 'gpt-4o-mini' });
  const repos = new InMemoryLlmConfigRepository();
  const audit = new UsageAuditService();
  return new LlmController(
    new GenerateTextUseCase(mock, audit),
    new GetLlmModelsUseCase(mock, config),
    new GetPipelineFlagsUseCase(repos),
    repos,
    audit,
  );
};

describe('LlmController', () => {
  it('generates text via mock', async () => {
    const result = await buildController().generateText({ prompt: 'hello' });
    expect(result.provider).toBe('mock');
    expect(result.text).toContain('[LLM MOCK]');
  });

  it('rejects empty prompts', async () => {
    await expect(
      buildController().generateText({ prompt: '  ' }),
    ).rejects.toThrow('prompt is required');
  });

  it('lists mock models without network', async () => {
    await expect(buildController().getModels()).resolves.toEqual({
      provider: 'mock',
      models: ['mock-default'],
    });
  });

  it('reads + patches config and resolves flags', async () => {
    const controller = buildController();
    await controller.patchConfig({ llmEnabled: true, publishingEnabled: true });
    const config = await controller.getConfig();
    expect(config.llmEnabled).toBe(true);
    const flags = (await controller.getFlags('true')) as {
      mode: string;
      llmActive: boolean;
    };
    expect(flags.mode).toBe('full-pipeline');
    expect(flags.llmActive).toBe(true);
  });

  it('rejects invalid config patches', async () => {
    await expect(
      buildController().patchConfig({ llmEnabled: 'yes' }),
    ).rejects.toThrow('llmEnabled must be a boolean');
  });

  it('exposes usage audit after a generation', async () => {
    const controller = buildController();
    await controller.generateText({ prompt: 'hello' });
    const usage = await controller.getUsage();
    expect(usage.entries).toHaveLength(1);
  });
});
