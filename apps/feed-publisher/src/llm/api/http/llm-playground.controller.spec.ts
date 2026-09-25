import { HttpException } from '@nestjs/common';
import { LlmPlaygroundController } from './llm-playground.controller';
import type {
  PreviewPromptUseCase,
  PreviewPromptResult,
} from '../../application/use-cases/preview-prompt.use-case';
import type { GetLlmModelsUseCase } from '../../application/use-cases/get-llm-models.use-case';

const rendered: PreviewPromptResult = {
  renderedUserPrompt: 'Title: T\nBody: Hola',
  systemPrompt: null,
  model: 'gpt-4o-mini',
  maxTokens: 800,
  temperature: 0.7,
  reasoningEffort: null,
  content: null,
};

const preview = {
  execute: async (): Promise<PreviewPromptResult> => rendered,
} as unknown as PreviewPromptUseCase;

describe('LlmPlaygroundController', () => {
  it('previews prompts without side effects (delegates to the use case)', async () => {
    const models = { execute: async (): Promise<never[]> => [] } as unknown as GetLlmModelsUseCase;
    const controller = new LlmPlaygroundController(preview, models);
    await expect(
      controller.preview({ rawContent: 'Hola' }),
    ).resolves.toEqual(rendered);
    await expect(controller.listModels()).resolves.toEqual([]);
  });

  it('maps gateway outages to 502 gateway-unreachable', async () => {
    const models = {
      execute: async (): Promise<never> => {
        throw new Error('down');
      },
    } as unknown as GetLlmModelsUseCase;
    const controller = new LlmPlaygroundController(preview, models);
    try {
      await controller.listModels();
      throw new Error('must not resolve');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(502);
    }
  });
});
