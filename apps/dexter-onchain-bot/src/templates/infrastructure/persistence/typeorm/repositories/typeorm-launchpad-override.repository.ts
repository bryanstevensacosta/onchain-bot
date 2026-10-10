import { Injectable } from '@nestjs/common';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { LaunchpadOverride } from '@/templates/domain/launchpad-override.entity';
import { LaunchpadOverrideDuplicateError } from '@/templates/domain/launchpad-override.validators';
import { LaunchpadOverrideRepository } from '@/templates/domain/ports/launchpad-override.repository';
import { LaunchpadOverrideOrmEntity } from '../launchpad-override.orm-entity';
import {
  toLaunchpadOverrideDomain,
  toLaunchpadOverrideRow,
} from '../mappers/launchpad-override.mapper';

/**
 * TypeORM `LaunchpadOverrideRepository` (dexter plan todo 37). Live
 * binding when `DATABASE_ENABLED=true` (same factory shape as the
 * `DisplayMapRepository` pair). Unique violations on `mint` surface as
 * `LaunchpadOverrideDuplicateError` (domain error, never a raw 500).
 */
@Injectable()
export class TypeOrmLaunchpadOverrideRepository extends LaunchpadOverrideRepository {
  public constructor(private readonly dataSource: DataSource) {
    super();
  }

  private rows(): Repository<LaunchpadOverrideOrmEntity> {
    return this.dataSource.getRepository(LaunchpadOverrideOrmEntity);
  }

  public async findAll(): Promise<readonly LaunchpadOverride[]> {
    const rows = await this.rows().find({ order: { mint: 'ASC' } });
    return rows.map(toLaunchpadOverrideDomain);
  }

  public async findOne(id: string): Promise<LaunchpadOverride | null> {
    const row = await this.rows().findOne({ where: { id } });
    return row ? toLaunchpadOverrideDomain(row) : null;
  }

  public async findByMint(mint: string): Promise<LaunchpadOverride | null> {
    const row = await this.rows().findOne({ where: { mint } });
    return row ? toLaunchpadOverrideDomain(row) : null;
  }

  public async save(row: LaunchpadOverride): Promise<LaunchpadOverride> {
    try {
      const saved = await this.rows().save(toLaunchpadOverrideRow(row));
      return toLaunchpadOverrideDomain(saved);
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as { code?: string }).code === '23505'
      ) {
        throw new LaunchpadOverrideDuplicateError(
          `LaunchpadOverride (${row.mint}) already exists`,
          { mint: row.mint },
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
