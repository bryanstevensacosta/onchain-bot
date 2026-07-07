import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LlmConfig } from 'telegram/crypto-news-publisher/domain/entities/llm-config.entity';
import { LlmConfigRepository } from 'telegram/crypto-news-publisher/application/ports/llm-config.repository';
import { LlmConfigEntity } from 'telegram/crypto-news-publisher/infrastructure/persistence/typeorm/entities/llm-config.entity';
import { LlmConfigMapper } from 'telegram/crypto-news-publisher/infrastructure/persistence/typeorm/mappers/llm-config.mapper';

/**
 * Postgres-backed implementation of `LlmConfigRepository`.
 *
 * The table holds exactly one row (id = 1). `load()` throws when the
 * row is missing — the migration service guarantees a row exists by
 * the time any consumer runs. If the migration was skipped
 * (e.g. `DATABASE_ENABLED=false` in dev), the failure surfaces
 * loudly at the first cron tick rather than silently using default
 * numeric values that would change behaviour between dev and prod.
 */
@Injectable()
export class TypeOrmLlmConfigRepository extends LlmConfigRepository {
  constructor(
    @InjectRepository(LlmConfigEntity)
    private readonly repo: Repository<LlmConfigEntity>,
  ) {
    super();
  }

  public async load(): Promise<LlmConfig> {
    const row = await this.repo.findOne({ where: { id: 1 } });
    if (!row) {
      throw new Error(
        'LlmConfig row missing (id=1). The migration service should have seeded it on bootstrap.',
      );
    }
    return LlmConfigMapper.toDomain(row);
  }

  public async save(config: LlmConfig): Promise<LlmConfig> {
    const row = LlmConfigMapper.toEntity(config);
    const saved = await this.repo.save(row);
    return LlmConfigMapper.toDomain(saved);
  }
}
