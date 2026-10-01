import { Injectable } from '@nestjs/common';
import { EmojiMap } from '@/templates/domain/emoji-map.entity';
import { EmojiMapDuplicateError } from '@/templates/domain/emoji-map.validators';
import { EmojiMapRepository } from '@/templates/domain/ports/emoji-map.repository';

/**
 * In-memory `EmojiMapRepository` (todo 5). Live binding when
 * `DATABASE_ENABLED=false` and in specs. Starts EMPTY — default seed
 * rows are inserted by the todo-9 seed service, never here.
 *
 * `matchValue` is normalized lowercase-trimmed at the entity boundary,
 * so the duplicate guard below is exact-match (case variants already
 * collapsed before they reach the store).
 */
@Injectable()
export class InMemoryEmojiMapRepository extends EmojiMapRepository {
  private readonly store = new Map<string, EmojiMap>();

  public async findAll(): Promise<readonly EmojiMap[]> {
    return [...this.store.values()].sort(
      (a, b) =>
        a.placeholderKey.localeCompare(b.placeholderKey) ||
        a.matchValue.localeCompare(b.matchValue),
    );
  }

  public async findByKey(placeholderKey: string): Promise<readonly EmojiMap[]> {
    const key = placeholderKey.trim();
    return [...this.store.values()]
      .filter((map) => map.placeholderKey === key)
      .sort((a, b) => a.matchValue.localeCompare(b.matchValue));
  }

  public async findOne(id: string): Promise<EmojiMap | null> {
    return this.store.get(id) ?? null;
  }

  public async save(map: EmojiMap): Promise<EmojiMap> {
    for (const existing of this.store.values()) {
      if (
        existing.id !== map.id &&
        existing.placeholderKey === map.placeholderKey &&
        existing.matchValue === map.matchValue
      ) {
        throw new EmojiMapDuplicateError(
          `EmojiMap (${map.placeholderKey}, ${map.matchValue}) already exists`,
          { placeholderKey: map.placeholderKey, matchValue: map.matchValue },
        );
      }
    }
    this.store.set(map.id, map);
    return map;
  }

  public async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }
}
