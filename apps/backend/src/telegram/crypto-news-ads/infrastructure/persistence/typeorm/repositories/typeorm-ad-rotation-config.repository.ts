import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdRotationConfig } from 'telegram/crypto-news-ads/domain/entities/ad-rotation-config.entity';
import { AdRotationConfigRepository } from 'telegram/crypto-news-ads/application/ports/ad-rotation-config.repository';
import { AdRotationConfigEntity } from 'telegram/crypto-news-ads/infrastructure/persistence/typeorm/entities/ad-rotation-config.entity';
import { AdRotationConfigMapper } from 'telegram/crypto-news-ads/infrastructure/persistence/typeorm/mappers/ad-rotation-config.mapper';

/**
 * Postgres-backed implementation of `AdRotationConfigRepository`.
 *
 * The table holds exactly one row (id = 1). `load()` returns the
 * default (`enabled=false`) when the row is missing so a deploy that
 * skipped the provisioning backfill fails safely into "ads disabled".
 */
@Injectable()
export class TypeOrmAdRotationConfigRepository extends AdRotationConfigRepository {
  constructor(
    @InjectRepository(AdRotationConfigEntity)
    private readonly repo: Repository<AdRotationConfigEntity>,
  ) {
    super();
  }

  public async load(): Promise<AdRotationConfig> {
    const row = await this.repo.findOne({ where: { id: 1 } });
    return row
      ? AdRotationConfigMapper.toDomain(row)
      : AdRotationConfig.empty();
  }

  public async save(cfg: AdRotationConfig): Promise<void> {
    await this.repo.save(AdRotationConfigMapper.toEntity(cfg));
  }
}
