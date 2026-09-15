import { Injectable } from '@nestjs/common';
import { ThreadsLlmConfig } from 'threads/publisher/domain/entities/threads-llm-config.entity';
import { ThreadsLlmConfigRepository } from 'threads/publisher/application/ports/threads-llm-config.repository';
import { THREADS_DEFAULT_TEMPLATE_ID } from 'threads/publisher/application/repositories/in-memory-threads-prompt-template.repository';

/**
 * In-memory `ThreadsLlmConfigRepository` for specs and local wiring.
 *
 * Seeds the single row (`id = 1`) with operator-safe defaults: both
 * flags off, dailyCap 60, reset hour 04:00 UTC, throttle window
 * 60s–300s, LLM retry budget 3. `seed()` lets specs flip flags
 * without touching the aggregate constructor.
 */
@Injectable()
export class InMemoryThreadsLlmConfigRepository extends ThreadsLlmConfigRepository {
  private config: ThreadsLlmConfig = ThreadsLlmConfig.load({
    defaultTemplateId: THREADS_DEFAULT_TEMPLATE_ID,
    llmEnabled: false,
    publishingEnabled: false,
    rejectNonLatin: true,
    dailyCap: 60,
    dailyResetUtcHour: 4,
    randomDelayMinMs: 60_000,
    randomDelayMaxMs: 300_000,
    llmMaxAttempts: 3,
  });

  public seed(patch: {
    llmEnabled?: boolean;
    publishingEnabled?: boolean;
    rejectNonLatin?: boolean;
    dailyCap?: number;
    dailyResetUtcHour?: number;
    randomDelayMinMs?: number;
    randomDelayMaxMs?: number;
    llmMaxAttempts?: number;
  }): void {
    this.config.update(patch);
  }

  public async load(): Promise<ThreadsLlmConfig> {
    return this.config;
  }

  public async save(config: ThreadsLlmConfig): Promise<ThreadsLlmConfig> {
    this.config = config;
    return this.config;
  }
}
