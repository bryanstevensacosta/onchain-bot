export type EmbeddingProviderName = 'mock' | 'openai' | 'local';

/**
 * Outbound port: text embeddings for dedup + search (ai-ml, todo 2).
 *
 * Centralizes the two migration sources without importing them: the
 * backend local model (`Xenova/all-MiniLM-L6-v2` via
 * `@xenova/transformers`, 30s load timeout, explicit errors) and the
 * feed-publisher OpenAI adapter (`text-embedding-3-small`, fail-open
 * there). Here failures are LOUD — `embed` throws an explicit error
 * when the provider is down (adversarial requirement), it never
 * resolves null. `model` selects the provider per call; adapters
 * ignore it unless it names their own model.
 */
export abstract class EmbeddingPort {
  public abstract get providerName(): EmbeddingProviderName;
  public abstract get modelName(): string;
  public abstract isAvailable(): Promise<boolean>;
  public abstract embed(
    text: string,
    model?: string,
  ): Promise<ReadonlyArray<number>>;
}
