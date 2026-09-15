import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ThreadsMatchingConfigRepository } from 'threads/integration/application/ports/threads-matching-config.repository';
import { ThreadsMatchingConfig } from 'threads/integration/domain/entities/threads-matching-config.entity';
import { ThreadsMatchingConfigEntity } from 'threads/integration/infrastructure/persistence/typeorm/entities/threads-matching-config.entity';

/**
 * TypeORM `ThreadsMatchingConfigRepository` (single row, id = 1).
 *
 * Mirror of crypto `TypeOrmMatchingConfigRepository` with one deliberate
 * deviation: first-boot seed is `enabled = true` (threads ships fail-open;
 * crypto seeds `false` fail-closed).
 */
@Injectable()
export class TypeOrmThreadsMatchingConfigRepository extends ThreadsMatchingConfigRepository {
  constructor(
    @InjectRepository(ThreadsMatchingConfigEntity)
    private readonly repo: Repository<ThreadsMatchingConfigEntity>,
  ) {
    super();
  }

  async load(): Promise<ThreadsMatchingConfig> {
    let row = await this.repo.findOne({ where: { id: 1 } });

    if (!row) {
      // Seed on first boot (fail-open per T5 contract)
      row = this.repo.create({ id: 1, enabled: true, updatedAt: new Date() });
      await this.repo.save(row);
    }

    return ThreadsMatchingConfig.reconstitute({
      id: row.id,
      enabled: row.enabled,
      updatedAt: row.updatedAt,
    });
  }

  async save(config: ThreadsMatchingConfig): Promise<void> {
    await this.repo.save({
      id: config.id,
      enabled: config.enabled,
      updatedAt: config.updatedAt,
    });
  }
}
