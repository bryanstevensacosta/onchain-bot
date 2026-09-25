import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MatchingConfigRepository } from '../../../../domain/ports/matching-config.repository';
import { MatchingConfig } from '../../../../domain/matching-config.entity';
import { MatchingConfigEntity } from '../entities/matching-config.entity';

/**
 * Postgres-backed `MatchingConfigRepository` (unwired until GAP-1).
 */
@Injectable()
export class TypeOrmMatchingConfigRepository extends MatchingConfigRepository {
  public constructor(
    @InjectRepository(MatchingConfigEntity)
    private readonly repo: Repository<MatchingConfigEntity>,
  ) {
    super();
  }

  public async load(): Promise<MatchingConfig> {
    let row = await this.repo.findOne({ where: { id: 1 } });
    if (!row) {
      row = this.repo.create({ id: 1, enabled: false, updatedAt: new Date() });
      await this.repo.save(row);
    }
    return MatchingConfig.reconstitute({
      id: row.id,
      enabled: row.enabled,
      updatedAt: row.updatedAt,
    });
  }

  public async save(config: MatchingConfig): Promise<void> {
    await this.repo.save({
      id: config.id,
      enabled: config.enabled,
      updatedAt: config.updatedAt,
    });
  }
}
