/**
 * Outbound port: text embeddings for the semantic dedup stage.
 *
 * Live binding is selected by env (DeduplicationModule factory): OpenAI
 * `text-embedding-3-small` when `OPENAI_API_KEY` is set and `USE_MOCK_AI`
 * is not 'true', otherwise the deterministic mock. `embed` resolves null
 * (never throws) when the provider is unavailable — the cascade treats
 * that as "different" (fail-open).
 */
export abstract class EmbeddingPort {
  public abstract isAvailable(): boolean;
  public abstract embed(text: string): Promise<ReadonlyArray<number> | null>;
}
