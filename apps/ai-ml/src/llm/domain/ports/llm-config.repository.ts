import type { LlmConfig } from '../llm-config';

export abstract class LlmConfigRepository {
  public abstract get(): Promise<LlmConfig>;
  public abstract update(patch: {
    llmEnabled?: boolean;
    publishingEnabled?: boolean;
  }): Promise<LlmConfig>;
}
