import { Injectable } from '@nestjs/common';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { DisplayMap } from '@/templates/domain/display-map.entity';
import { DisplayMapDuplicateError } from '@/templates/domain/display-map.validators';
import { DisplayMapRepository } from '@/templates/domain/ports/display-map.repository';
import { DisplayMapOrmEntity } from '../display-map.orm-entity';
import { toDisplayMapDomain, toDisplayMapRow } from '../mappers/display-map.mapper';

/**
 * TypeORM `DisplayMapRepository` (display-catalog rename). Live binding
 * when `DATABASE_ENABLED=true` (wired in todo 13). Unique violations on
 * `(placeholderKey, matchValue)` surface as `DisplayMapDuplicateError`
 * (domain error, never a raw 500).
 */
@Injectable()
export class TypeOrmDisplayMapRepository extends DisplayMapRepository {
  public constructor(private readonly dataSource: DataSource) {
    super();
  }

  private rows(): Repository<DisplayMapOrmEntity> {
    return this.dataSource.getRepository(DisplayMapOrmEntity);
  }

  public async findAll(): Promise<readonly DisplayMap[]> {
    const rows = await this.rows().find({
      order: { placeholderKey: 'ASC', matchValue: 'ASC' },
    });
    return rows.map(toDisplayMapDomain);
  }

  public async findByKey(placeholderKey: string): Promise<readonly DisplayMap[]> {
    const rows = await this.rows().find({
      where: { placeholderKey: placeholderKey.trim() },
      order: { matchValue: 'ASC' },
    });
    return rows.map(toDisplayMapDomain);
  }

  public async findOne(id: string): Promise<DisplayMap | null> {
    const row = await this.rows().findOne({ where: { id } });
    return row ? toDisplayMapDomain(row) : null;
  }

  public async save(map: DisplayMap): Promise<DisplayMap> {
    try {
      const saved = await this.rows().save(toDisplayMapRow(map));
      return toDisplayMapDomain(saved);
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as { code?: string }).code === '23505'
      ) {
        throw new DisplayMapDuplicateError(
          `DisplayMap (${map.placeholderKey}, ${map.matchValue}) already exists`,
          { placeholderKey: map.placeholderKey, matchValue: map.matchValue },
        );
      }
      throw error;
    }
  }

  public async delete(id: string): Promise<boolean> {
    const result = await this.rows().delete(id);
    return (result.affected ?? 0) > 0;
  }
}
