import { Injectable } from '@nestjs/common';
import { DisplayMap } from '../domain/display-map.entity';
import { DisplayMapRepository } from '../domain/ports/display-map.repository';
import type { DisplayResolverPort } from '@/placeholders/application/template-renderer.service';

/**
 * Table-driven `DisplayResolverPort` implementation (renamed from
 * EmojiResolver).
 *
 * Implements EXACTLY the `DisplayResolverPort` interface owned by
 * `src/placeholders/application/template-renderer.service.ts`
 * (`resolve(placeholderKey, matchValue): string`) — no competing
 * interface is defined here.
 *
 * Sync-read / async-load split: the renderer calls `resolve()` inline
 * during `render()`, so lookups run against an in-memory cache;
 * `refresh()` reloads the cache from the repository (called at boot /
 * after CRUD writes — wiring in todo 13, which also binds this class to
 * the `DISPLAY_RESOLVER` symbol). Unknown pairs fall back to `""` (never
 * throw, never a hardcoded display — seed data comes from todo 9).
 *
 * v1 EXCLUSION (documented): `ChatSettings.emojiMode` is NOT consulted
 * here. The resolver is chat-agnostic by design; honoring
 * `emojiMode=false` is a fase-2 concern (plan §36).
 */
@Injectable()
export class DisplayResolverService implements DisplayResolverPort {
  private readonly cache = new Map<string, Map<string, string>>();

  public constructor(private readonly maps: DisplayMapRepository) {}

  /** Reload the lookup cache from the repository. */
  public async refresh(): Promise<void> {
    const all = await this.maps.findAll();
    const next = new Map<string, Map<string, string>>();
    for (const map of all) {
      DisplayResolverService.index(next, map);
    }
    this.cache.clear();
    for (const [key, matches] of next) {
      this.cache.set(key, matches);
    }
  }

  public resolve(placeholderKey: string, matchValue: string): string {
    if (typeof placeholderKey !== 'string' || typeof matchValue !== 'string') {
      return '';
    }
    return (
      this.cache
        .get(placeholderKey.trim())
        ?.get(matchValue.trim().toLowerCase()) ?? ''
    );
  }

  /**
   * Snapshot of every cached `(matchValue -> display)` pair for a key
   * (defensive copy; mutating it never touches the cache). Todo 8
   * (display API) and todo 7 (preview) consume this for listings.
   */
  public resolveAll(placeholderKey: string): ReadonlyMap<string, string> {
    if (typeof placeholderKey !== 'string') {
      return new Map();
    }
    return new Map(this.cache.get(placeholderKey.trim()) ?? []);
  }

  private static index(
    into: Map<string, Map<string, string>>,
    map: DisplayMap,
  ): void {
    let matches = into.get(map.placeholderKey);
    if (!matches) {
      matches = new Map<string, string>();
      into.set(map.placeholderKey, matches);
    }
    matches.set(map.matchValue, map.display);
  }
}
