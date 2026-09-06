import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MatchingConfigRepository } from 'telegram/crypto-news-integration/application/ports/matching-config.repository';
import { MatchingConfig } from 'telegram/crypto-news-integration/domain/entities/matching-config.entity';
import { MatchingConfigEntity } from 'telegram/crypto-news-integration/infrastructure/persistence/typeorm/entities/matching-config.entity';

@Injectable()
export class TypeOrmMatchingConfigRepository extends MatchingConfigRepository {
  constructor(
    @InjectRepository(MatchingConfigEntity)
    private readonly repo: Repository<MatchingConfigEntity>,
  ) {
    super();
  }

  async load(): Promise<MatchingConfig> {
    let row = await this.repo.findOne({ where: { id: 1 } });

    if (!row) {
      // Seed on first boot
      row = this.repo.create({ id: 1, enabled: false, updatedAt: new Date() });
      await this.repo.save(row);
    }

    return MatchingConfig.reconstitute({
      id: row.id,
      enabled: row.enabled,
      updatedAt: row.updatedAt,
    });
  }

  async save(config: MatchingConfig): Promise<void> {
    await this.repo.save({
      id: config.id,
      enabled: config.enabled,
      updatedAt: config.updatedAt,
    });
  }
}
