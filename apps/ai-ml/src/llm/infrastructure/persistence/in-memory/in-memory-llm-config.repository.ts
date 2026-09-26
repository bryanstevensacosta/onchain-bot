import { Injectable } from '@nestjs/common';
import { LlmConfigRepository } from '../../../domain/ports/llm-config.repository';
import { DEFAULT_LLM_CONFIG, type LlmConfig } from '../../../domain/llm-config';

/**
 * In-memory single-row LlmConfig (ai-ml, todo 0): the two switches
 * ai-ml owns (llm + publishing). TypeORM persistence lands with the
 * prompts catalog (todo 1) reusing this exact shape.
 */
@Injectable()
export class InMemoryLlmConfigRepository extends LlmConfigRepository {
  private current: LlmConfig = {
    ...DEFAULT_LLM_CONFIG,
    updatedAt: new Date().toISOString(),
  };

  public constructor() {
    super();
  }

  /** Test/dev seeding (not part of the port). */
  public seed(initial: Partial<LlmConfig>): void {
    this.current = { ...this.current, ...initial, updatedAt: new Date().toISOString() };
  }

  public async get(): Promise<LlmConfig> {
    return { ...this.current };
  }

  public async update(patch: {
    llmEnabled?: boolean;
    publishingEnabled?: boolean;
  }): Promise<LlmConfig> {
    this.current = { ...this.current, ...patch, updatedAt: new Date().toISOString() };
    return { ...this.current };
  }
}
