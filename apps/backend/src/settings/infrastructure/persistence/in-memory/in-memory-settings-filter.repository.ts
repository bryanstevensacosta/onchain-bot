import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SettingsFilterEntity } from 'settings/infrastructure/persistence/typeorm/entities/settings-filter.entity';

interface WhereClause {
  type?: string;
  value?: string;
  enabled?: boolean;
  scope?: string;
}

/**
 * In-memory replacement for the TypeORM Repository<SettingsFilterEntity>
 * used by SettingsService when DATABASE_ENABLED=false (or when the TypeORM
 * module hasn't registered the entity — typically because ConfigModule
 * loads .env after SettingsModule's decorator has already evaluated
 * `isDatabaseEnabled()`).
 *
 * Implements only the subset of Repository that SettingsService uses:
 *   - find({ where })
 *   - findOne({ where })
 *   - create(dto)
 *   - save(entity)
 *
 * Lives in infrastructure so SettingsService stays unchanged. Mirrors the
 * IdentityModule pattern (see in-memory-kol.repository.ts).
 */
@Injectable()
export class InMemorySettingsFilterRepository {
  private readonly store = new Map<string, SettingsFilterEntity>();

  public async find(opts?: {
    where?: WhereClause;
  }): Promise<SettingsFilterEntity[]> {
    const where = opts?.where ?? {};
    const matches = Array.from(this.store.values()).filter((row) =>
      this.matchesWhere(row, where),
    );
    return matches;
  }

  public async findOne(opts: {
    where: WhereClause;
  }): Promise<SettingsFilterEntity | null> {
    const where = opts.where;
    for (const row of this.store.values()) {
      if (this.matchesWhere(row, where)) {
        return row;
      }
    }
    return null;
  }

  public create(dto: Partial<SettingsFilterEntity>): SettingsFilterEntity {
    const entity = new SettingsFilterEntity();
    entity.id = dto.id ?? randomUUID();
    entity.type = dto.type ?? '';
    entity.value = dto.value ?? '';
    entity.numericValue = dto.numericValue ?? null;
    entity.scope = dto.scope ?? 'global';
    entity.enabled = dto.enabled ?? true;
    entity.notes = dto.notes ?? null;
    entity.createdAt = dto.createdAt ?? new Date();
    entity.updatedAt = dto.updatedAt ?? new Date();
    return entity;
  }

  public async save(
    entity: SettingsFilterEntity,
  ): Promise<SettingsFilterEntity> {
    if (!entity.id) {
      entity.id = randomUUID();
    }
    entity.updatedAt = new Date();
    this.store.set(entity.id, entity);
    return entity;
  }

  private matchesWhere(row: SettingsFilterEntity, where: WhereClause): boolean {
    if (where.type !== undefined && row.type !== where.type) return false;
    if (where.value !== undefined && row.value !== where.value) return false;
    if (where.enabled !== undefined && row.enabled !== where.enabled)
      return false;
    if (where.scope !== undefined && row.scope !== where.scope) return false;
    return true;
  }
}
