import { BadRequestException } from '@nestjs/common';
import { LlmConfigController } from './llm-config.controller';
import { LlmConfig } from '../../domain/llm-config.entity';
import { MatchingConfig } from '../../../matching/domain/matching-config.entity';
import type { LlmConfigRepository } from '../../domain/ports/llm-config.repository';
import type { MatchingConfigRepository } from '../../../matching/domain/ports/matching-config.repository';
import { GetPipelineFlagsUseCase } from '../../application/use-cases/get-pipeline-flags.use-case';

const base = {
  defaultTemplateId: 'default-feed',
  dailyCap: 36,
  dailyResetUtcHour: 0,
  randomDelayMinMs: 1000,
  randomDelayMaxMs: 5000,
  llmMaxAttempts: 3,
};

const harness = (overrides?: {
  llm?: boolean;
  publishing?: boolean;
  matching?: boolean;
}): { controller: LlmConfigController; llmRepo: LlmConfigRepository } => {
  let stored = LlmConfig.load({
    ...base,
    llmEnabled: overrides?.llm ?? false,
    publishingEnabled: overrides?.publishing ?? false,
  });
  const llmRepo = {
    load: async (): Promise<LlmConfig> => stored,
    save: async (cfg: LlmConfig): Promise<LlmConfig> => {
      stored = cfg;
      return cfg;
    },
  } as LlmConfigRepository;
  const matchingRepo = {
    load: async (): Promise<MatchingConfig> =>
      MatchingConfig.load({ enabled: overrides?.matching ?? false }),
    save: async (cfg: MatchingConfig): Promise<MatchingConfig> => cfg,
  } as unknown as MatchingConfigRepository;
  const controller = new LlmConfigController(
    llmRepo,
    new GetPipelineFlagsUseCase(llmRepo, matchingRepo),
  );
  return { controller, llmRepo };
};

describe('LlmConfigController', () => {
  const OLD_ENV = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = OLD_ENV;
  });

  it('reads config and toggles flags', async () => {
    const { controller } = harness();
    await expect(controller.getConfig()).resolves.toMatchObject({
      llmEnabled: false,
      publishingEnabled: false,
    });
    const updated = await controller.updateConfig({ publishingEnabled: true });
    expect(updated.publishingEnabled).toBe(true);
  });

  it('rejects foreign matchingEnabled with a hint at the owning endpoint', async () => {
    const { controller } = harness();
    await expect(
      controller.updateConfig({ matchingEnabled: true } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects llmEnabled=true while publishing is off (2-flag invariant)', async () => {
    const { controller } = harness({ publishing: false });
    await expect(controller.updateConfig({ llmEnabled: true })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('locks llmEnabled in production', async () => {
    process.env.NODE_ENV = 'production';
    const { controller } = harness({ publishing: true });
    await expect(controller.updateConfig({ llmEnabled: false })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('exposes the composed 3-flag view', async () => {
    const { controller } = harness({ llm: true, publishing: true, matching: true });
    await expect(controller.getFlags()).resolves.toMatchObject({
      mode: 'full-pipeline',
      llmActive: true,
      flags: { matching: true, llm: true, publishing: true },
    });
  });

});
