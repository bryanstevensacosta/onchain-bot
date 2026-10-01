import { EmbeddingCache } from './embedding-cache';

describe('EmbeddingCache (ai-ml todo 2, failing-first)', () => {
  it('returns undefined on a cold key', () => {
    const cache = new EmbeddingCache(10);
    expect(cache.get('text-embedding-3-small', 'hello')).toBeUndefined();
    expect(cache.stats().misses).toBe(1);
  });

  it('hits after set without calling the provider', () => {
    const cache = new EmbeddingCache(10);
    cache.set('mock-deterministic-64', 'hello', [1, 0]);
    expect(cache.get('mock-deterministic-64', 'hello')).toEqual([1, 0]);
    expect(cache.stats().hits).toBe(1);
  });

  it('keys by model + text (same text, different model = miss)', () => {
    const cache = new EmbeddingCache(10);
    cache.set('model-a', 'hello', [1]);
    expect(cache.get('model-b', 'hello')).toBeUndefined();
  });

  it('evicts the oldest entry when full (LRU cap)', () => {
    const cache = new EmbeddingCache(2);
    cache.set('m', 'a', [1]);
    cache.set('m', 'b', [2]);
    cache.set('m', 'c', [3]);
    expect(cache.get('m', 'a')).toBeUndefined();
    expect(cache.get('m', 'b')).toEqual([2]);
    expect(cache.get('m', 'c')).toEqual([3]);
    expect(cache.size).toBe(2);
  });

  it('clear() empties the cache', () => {
    const cache = new EmbeddingCache(10);
    cache.set('m', 'a', [1]);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get('m', 'a')).toBeUndefined();
  });
});
