import { Injectable } from '@nestjs/common';
import { EmojiMap } from '../domain/emoji-map.entity';
import { EmojiMapRepository } from '../domain/ports/emoji-map.repository';
import type { EmojiResolverPort } from '@/placeholders/application/template-renderer.service';

/**
 * Table-driven `EmojiResolverPort` implementation (todo 5).
 *
 * Implements EXACTLY the `EmojiResolverPort` interface owned by
 * `src/placeholders/application/template-renderer.service.ts`
 * (`resolve(placeholderKey, matchValue): string`) — no competing
 * interface is defined here.
 *
 * Sync-read / async-load split: the renderer calls `resolve()` inline
 * during `render()`, so lookups run against an in-memory cache;
 * `refresh()` reloads the cache from the repository (called at boot /
 * after CRUD writes — wiring in todo 13, which also binds this class to
 * the `EMOJI_RESOLVER` symbol). Unknown pairs fall back to `""` (never
 * throw, never a hardcoded emoji — seed data comes from todo 9).
 *
 * v1 EXCLUSION (documented): `ChatSettings.emojiMode` is NOT consulted
 * here. The resolver is chat-agnostic by design; honoring
 * `emojiMode=false` is a fase-2 concern (plan §36).
 */
@Injectable()
export class EmojiResolverService implements EmojiResolverPort {
  private readonly cache = new Map<string, Map<string, string>>();

  public constructor(private readonly maps: EmojiMapRepository) {}

  /** Reload the lookup cache from the repository. */
  public async refresh(): Promise<void> {
    const all = await this.maps.findAll();
    const next = new Map<string, Map<string, string>>();
    for (const map of all) {
      EmojiResolverService.index(next, map);
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
   * Snapshot of every cached `(matchValue -> emoji)` pair for a key
   * (defensive copy; mutating it never touches the cache). Todo 8
   * (emoji API) and todo 7 (preview) consume this for listings.
   */
  public resolveAll(placeholderKey: string): ReadonlyMap<string, string> {
    if (typeof placeholderKey !== 'string') {
      return new Map();
    }
    return new Map(this.cache.get(placeholderKey.trim()) ?? []);
  }

  private static index(
    into: Map<string, Map<string, string>>,
    map: EmojiMap,
  ): void {
    let matches = into.get(map.placeholderKey);
    if (!matches) {
      matches = new Map<string, string>();
      into.set(map.placeholderKey, matches);
    }
    matches.set(map.matchValue, map.emoji);
  }
}
