import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BlacklistPhrase } from '../../../../domain/blacklist-phrase.entity';
import { BlacklistPhraseRepository } from '../../../../application/ports/blacklist-phrase.repository';
import { BlacklistPhraseEntity } from '../entities/blacklist-phrase.entity';
import { BlacklistPhraseMapper } from '../mappers/blacklist-phrase.mapper';

/**
 * Postgres-backed `BlacklistPhraseRepository` (unwired until GAP-1).
 */
@Injectable()
export class TypeOrmBlacklistPhraseRepository extends BlacklistPhraseRepository {
  constructor(
    @InjectRepository(BlacklistPhraseEntity)
    private readonly repo: Repository<BlacklistPhraseEntity>,
  ) {
    super();
  }

  public async findAll(): Promise<ReadonlyArray<BlacklistPhrase>> {
    const rows = await this.repo.find({ order: { createdAt: 'ASC' } });
    return rows.map((r) => BlacklistPhraseMapper.toDomain(r));
  }

  public async findEnabled(): Promise<ReadonlyArray<BlacklistPhrase>> {
    const rows = await this.repo.find({
      where: { enabled: true },
      order: { createdAt: 'ASC' },
    });
    return rows.map((r) => BlacklistPhraseMapper.toDomain(r));
  }

  public async save(blacklistPhrase: BlacklistPhrase): Promise<void> {
    await this.repo.save(BlacklistPhraseMapper.toEntity(blacklistPhrase));
  }

  public async delete(id: string): Promise<void> {
    await this.repo.delete({ id });
  }
}
