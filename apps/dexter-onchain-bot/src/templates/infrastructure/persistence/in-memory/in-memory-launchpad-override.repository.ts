import { Injectable } from '@nestjs/common';
import { LaunchpadOverride } from '@/templates/domain/launchpad-override.entity';
import { LaunchpadOverrideDuplicateError } from '@/templates/domain/launchpad-override.validators';
import { LaunchpadOverrideRepository } from '@/templates/domain/ports/launchpad-override.repository';

/**
 * In-memory `LaunchpadOverrideRepository` (dexter plan todo 37). Live
 * binding when `DATABASE_ENABLED=false` and in specs. Starts EMPTY —
 * override rows are operator-curated via the API, never seeded.
 *
 * `mint` is normalized at the entity boundary, so the duplicate guard
 * below is exact-match (EVM case variants already collapsed before
 * they reach the store).
 */
@Injectable()
export class InMemoryLaunchpadOverrideRepository extends LaunchpadOverrideRepository {
  private readonly store = new Map<string, LaunchpadOverride>();

  public async findAll(): Promise<readonly LaunchpadOverride[]> {
    return [...this.store.values()].sort((a, b) =>
      a.mint.localeCompare(b.mint),
    );
  }

  public async findOne(id: string): Promise<LaunchpadOverride | null> {
    return this.store.get(id) ?? null;
  }

  public async findByMint(mint: string): Promise<LaunchpadOverride | null> {
    for (const row of this.store.values()) {
      if (row.mint === mint) return row;
    }
    return null;
  }

  public async save(row: LaunchpadOverride): Promise<LaunchpadOverride> {
    for (const existing of this.store.values()) {
      if (existing.id !== row.id && existing.mint === row.mint) {
        throw new LaunchpadOverrideDuplicateError(
          `LaunchpadOverride (${row.mint}) already exists`,
          { mint: row.mint },
        );
      }
    }
    this.store.set(row.id, row);
    return row;
  }

  public async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }
}
