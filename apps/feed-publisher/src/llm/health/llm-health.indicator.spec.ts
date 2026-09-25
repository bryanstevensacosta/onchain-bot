import { LlmHealthIndicator } from './llm-health.indicator';
import { LlmPort } from '../application/ports/llm.port';
import type { LlmConfigRepository } from '../domain/ports/llm-config.repository';
import { LlmConfig } from '../domain/llm-config.entity';

const base = {
  defaultTemplateId: 'default-feed',
  dailyCap: 36,
  dailyResetUtcHour: 0,
  randomDelayMinMs: 1000,
  randomDelayMaxMs: 5000,
  llmMaxAttempts: 3,
};

const configRepo = (fail = false): LlmConfigRepository =>
  ({
    load: async (): Promise<LlmConfig> => {
      if (fail) throw new Error('db down');
      return LlmConfig.load({ ...base });
    },
    save: async (cfg: LlmConfig): Promise<LlmConfig> => cfg,
  }) as LlmConfigRepository;

const port = (available: boolean): LlmPort =>
  ({
    isAvailable: async (): Promise<boolean> => available,
    generateText: async (): Promise<string> => 'x',
  }) as LlmPort;

describe('LlmHealthIndicator (P21 hook, depth only)', () => {
  const OLD_ENV = process.env.USE_MOCK_AI;
  afterEach(() => {
    if (OLD_ENV === undefined) delete process.env.USE_MOCK_AI;
    else process.env.USE_MOCK_AI = OLD_ENV;
  });

  it('is up in mock mode without touching the gateway', async () => {
    process.env.USE_MOCK_AI = 'true';
    const indicator = new LlmHealthIndicator(configRepo(), port(false));
    await expect(indicator.check()).resolves.toEqual({
      component: 'llm',
      status: 'up',
    });
  });

  it('mirrors gateway availability otherwise, and goes down on repo errors', async () => {
    process.env.USE_MOCK_AI = 'false';
    await expect(
      new LlmHealthIndicator(configRepo(), port(true)).check(),
    ).resolves.toMatchObject({ status: 'up' });
    await expect(
      new LlmHealthIndicator(configRepo(), port(false)).check(),
    ).resolves.toMatchObject({ status: 'down' });
    await expect(
      new LlmHealthIndicator(configRepo(true), port(true)).check(),
    ).resolves.toMatchObject({ status: 'down' });
  });
});
