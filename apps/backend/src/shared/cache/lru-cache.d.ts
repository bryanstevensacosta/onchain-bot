/**
 * Type declarations for lru-cache v5.
 *
 * v5.1.1 is CJS: `module.exports = LRUCache` (no named export).
 * TypeScript would otherwise resolve to global v10 types (without `export default`),
 * causing `import LRUCache from 'lru-cache'` to be typed as the module namespace
 * (not constructable). This file overrides that.
 */
declare module 'lru-cache' {
  class LRUCache<K, V> {
    constructor(options?: LRUCache.Options<K, V>);
    set(key: K, value: V, maxAge?: number): boolean;
    get(key: K): V | undefined;
    peek(key: K): V | undefined;
    has(key: K): boolean;
    del(key: K): void;
    reset(): void;
    keys(): K[];
    values(): V[];
    forEach(
      fn: (value: V, key: K, cache: LRUCache<K, V>) => void,
      thisp?: unknown,
    ): void;
    rforEach(
      fn: (value: V, key: K, cache: LRUCache<K, V>) => void,
      thisp?: unknown,
    ): void;
    readonly length: number;
    readonly itemCount: number;
    dump(): Array<{ k: K; v: V; e: number }>;
    load(arr: Array<{ k: K; v: V; e: number }>): void;
    prune(): void;
  }

  namespace LRUCache {
    interface Options<K, V> {
      max?: number;
      maxAge?: number;
      length?(value: V, key: K): number;
      dispose?(key: K, value: V): void;
      stale?: boolean;
      noDisposeOnSet?: boolean;
      updateAgeOnGet?: boolean;
    }
  }

  export default LRUCache;
}
