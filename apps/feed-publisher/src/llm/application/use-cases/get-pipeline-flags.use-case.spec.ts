import { GetPipelineFlagsUseCase } from './get-pipeline-flags.use-case';
import { LlmConfig } from '../../domain/llm-config.entity';
import { MatchingConfig } from '../../../matching/domain/matching-config.entity';
import type { LlmConfigRepository } from '../../domain/ports/llm-config.repository';
import type { MatchingConfigRepository } from '../../../matching/domain/ports/matching-config.repository';

const base = {
  defaultTemplateId: 'default-feed',
  dailyCap: 36,
  dailyResetUtcHour: 0,
  randomDelayMinMs: 1000,
  randomDelayMaxMs: 5000,
  llmMaxAttempts: 3,
};

const useCase = (matching: boolean, llm: boolean, publishing: boolean) => {
  const llmRepo = {
    load: async (): Promise<LlmConfig> =>
      LlmConfig.load({ ...base, llmEnabled: llm, publishingEnabled: publishing }),
    save: async (cfg: LlmConfig): Promise<LlmConfig> => cfg,
  } as LlmConfigRepository;
  const matchingRepo = {
    load: async (): Promise<MatchingConfig> =>
      MatchingConfig.load({ enabled: matching }),
    save: async (cfg: MatchingConfig): Promise<MatchingConfig> => cfg,
  } as unknown as MatchingConfigRepository;
  return new GetPipelineFlagsUseCase(llmRepo, matchingRepo);
};

describe('GetPipelineFlagsUseCase', () => {
  it('composes the 3-flag view with the truth-table mode', async () => {
    await expect(
      useCase(true, true, true).execute(),
    ).resolves.toMatchObject({ mode: 'full-pipeline', llmActive: true });
    await expect(
      useCase(true, true, false).execute(),
    ).resolves.toMatchObject({ mode: 'enqueue-only', llmActive: false });
    await expect(
      useCase(false, false, false).execute(),
    ).resolves.toMatchObject({ mode: 'all-paused', llmActive: false });
  });
});
