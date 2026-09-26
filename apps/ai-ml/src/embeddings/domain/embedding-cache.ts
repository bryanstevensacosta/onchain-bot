export interface EmbeddingCacheStats {
  readonly size: number;
  readonly maxEntries: number;
  readonly hits: number;
  readonly misses: number;
}

/**
 * EmbeddingCache (ai-ml, todo 2): tiny LRU over model + text.
 *
 * Embeddings are deterministic per (model, text), so caching is safe
 * and cuts provider cost on re-enqueues. Keyed `${model}::${text}`;
 * oldest entry evicted when full. No TTL — vectors never go stale.
 */
export class EmbeddingCache {
  private readonly entries = new Map<string, ReadonlyArray<number>>();
  private hits = 0;
  private misses = 0;

  public constructor(private readonly maxEntries = 500) {}

  public get(model: string, text: string): ReadonlyArray<number> | undefined {
    const hit = this.entries.get(EmbeddingCache.key(model, text));
    if (hit === undefined) {
      this.misses += 1;
      return undefined;
    }
    // Refresh recency (LRU).
    this.entries.delete(EmbeddingCache.key(model, text));
    this.entries.set(EmbeddingCache.key(model, text), hit);
    this.hits += 1;
    return hit;
  }

  public set(model: string, text: string, vector: ReadonlyArray<number>): void {
    const key = EmbeddingCache.key(model, text);
    if (this.entries.has(key)) {
      this.entries.delete(key);
    }
    this.entries.set(key, [...vector]);
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done === true) {
        break;
      }
      this.entries.delete(oldest.value);
    }
  }

  public clear(): void {
    this.entries.clear();
  }

  public get size(): number {
    return this.entries.size;
  }

  public stats(): EmbeddingCacheStats {
    return {
      size: this.entries.size,
      maxEntries: this.maxEntries,
      hits: this.hits,
      misses: this.misses,
    };
  }

  private static key(model: string, text: string): string {
    return `${model}::${text}`;
  }
}
