import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SettingsPresetEntity } from 'settings/infrastructure/persistence/typeorm/entities/settings-preset.entity';

interface WhereClause {
  id?: string;
  name?: string;
  isActive?: boolean;
}

/**
 * In-memory replacement for the TypeORM Repository<SettingsPresetEntity>
 * used by SettingsPresetsService when DATABASE_ENABLED=false (or when the TypeORM
 * module hasn't registered the entity — typically because ConfigModule
 * loads .env after SettingsModule's decorator has already evaluated
 * `isDatabaseEnabled()`).
 *
 * Implements only the subset of Repository that SettingsPresetsService uses:
 *   - find({ where, order })
 *   - findOne({ where })
 *   - create(dto)
 *   - save(entity)
 *   - remove(entity)
 *
 * Lives in infrastructure so SettingsPresetsService stays unchanged. Mirrors the
 * IdentityModule pattern (see in-memory-kol.repository.ts).
 */
@Injectable()
export class InMemorySettingsPresetRepository {
  private readonly store = new Map<string, SettingsPresetEntity>();

  public async find(opts?: {
    where?: WhereClause;
    order?: { name?: 'ASC' | 'DESC' };
  }): Promise<SettingsPresetEntity[]> {
    const where = opts?.where ?? {};
    const order = opts?.order ?? {};
    let matches = Array.from(this.store.values()).filter((row) =>
      this.matchesWhere(row, where),
    );

    if (order.name) {
      matches = matches.sort((a, b) =>
        order.name === 'ASC'
          ? a.name.localeCompare(b.name)
          : b.name.localeCompare(a.name),
      );
    }

    return matches;
  }

  public async findOne(opts: {
    where: WhereClause;
  }): Promise<SettingsPresetEntity | null> {
    const where = opts.where;
    for (const row of this.store.values()) {
      if (this.matchesWhere(row, where)) {
        return row;
      }
    }
    return null;
  }

  public create(dto: Partial<SettingsPresetEntity>): SettingsPresetEntity {
    const entity = new SettingsPresetEntity();
    entity.id = dto.id ?? randomUUID();
    entity.name = dto.name ?? '';
    entity.description = dto.description ?? null;
    entity.snapshot = dto.snapshot ?? {};
    entity.isActive = dto.isActive ?? false;
    entity.createdBy = dto.createdBy ?? null;
    entity.createdAt = dto.createdAt ?? new Date();
    entity.updatedAt = dto.updatedAt ?? new Date();
    return entity;
  }

  public async save(
    entity: SettingsPresetEntity,
  ): Promise<SettingsPresetEntity> {
    if (!entity.id) {
      entity.id = randomUUID();
    }
    entity.updatedAt = new Date();
    this.store.set(entity.id, entity);
    return entity;
  }

  public async remove(entity: SettingsPresetEntity): Promise<void> {
    this.store.delete(entity.id);
  }

  private matchesWhere(row: SettingsPresetEntity, where: WhereClause): boolean {
    if (where.id !== undefined && row.id !== where.id) return false;
    if (where.name !== undefined && row.name !== where.name) return false;
    if (where.isActive !== undefined && row.isActive !== where.isActive)
      return false;
    return true;
  }
}
