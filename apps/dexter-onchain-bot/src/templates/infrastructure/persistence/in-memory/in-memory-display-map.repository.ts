import { Injectable } from '@nestjs/common';
import { DisplayMap } from '@/templates/domain/display-map.entity';
import { DisplayMapDuplicateError } from '@/templates/domain/display-map.validators';
import { DisplayMapRepository } from '@/templates/domain/ports/display-map.repository';

/**
 * In-memory `DisplayMapRepository` (display-catalog rename). Live binding
 * when `DATABASE_ENABLED=false` and in specs. Starts EMPTY — default seed
 * rows are inserted by the todo-9 seed service, never here.
 *
 * `matchValue` is normalized lowercase-trimmed at the entity boundary,
 * so the duplicate guard below is exact-match (case variants already
 * collapsed before they reach the store).
 */
@Injectable()
export class InMemoryDisplayMapRepository extends DisplayMapRepository {
  private readonly store = new Map<string, DisplayMap>();

  public async findAll(): Promise<readonly DisplayMap[]> {
    return [...this.store.values()].sort(
      (a, b) =>
        a.placeholderKey.localeCompare(b.placeholderKey) ||
        a.matchValue.localeCompare(b.matchValue),
    );
  }

  public async findByKey(
    placeholderKey: string,
  ): Promise<readonly DisplayMap[]> {
    const key = placeholderKey.trim();
    return [...this.store.values()]
      .filter((map) => map.placeholderKey === key)
      .sort((a, b) => a.matchValue.localeCompare(b.matchValue));
  }

  public async findOne(id: string): Promise<DisplayMap | null> {
    return this.store.get(id) ?? null;
  }

  public async save(map: DisplayMap): Promise<DisplayMap> {
    for (const existing of this.store.values()) {
      if (
        existing.id !== map.id &&
        existing.placeholderKey === map.placeholderKey &&
        existing.matchValue === map.matchValue
      ) {
        throw new DisplayMapDuplicateError(
          `DisplayMap (${map.placeholderKey}, ${map.matchValue}) already exists`,
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
