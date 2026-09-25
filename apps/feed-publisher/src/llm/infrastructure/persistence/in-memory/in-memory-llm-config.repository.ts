import { Injectable } from '@nestjs/common';
import { LlmConfig } from '../../../domain/llm-config.entity';
import { LlmConfigRepository } from '../../../domain/ports/llm-config.repository';

/**
 * In-memory `LlmConfig` store (live binding until GAP-1). Seeds the
 * single fail-closed row (`id = 1`, `defaultTemplateId = 'default-feed'`,
 * llm + publishing off) on first boot.
 */
@Injectable()
export class InMemoryLlmConfigRepository extends LlmConfigRepository {
  private stored: LlmConfig;

  public constructor() {
    super();
    this.stored = LlmConfig.load({
      defaultTemplateId: 'default-feed',
      dailyCap: 36,
      dailyResetUtcHour: 0,
      randomDelayMinMs: 1000,
      randomDelayMaxMs: 5000,
      llmMaxAttempts: 3,
    });
  }

  public async load(): Promise<LlmConfig> {
    return this.stored;
  }

  public async save(config: LlmConfig): Promise<LlmConfig> {
    this.stored = config;
    return config;
  }
}
