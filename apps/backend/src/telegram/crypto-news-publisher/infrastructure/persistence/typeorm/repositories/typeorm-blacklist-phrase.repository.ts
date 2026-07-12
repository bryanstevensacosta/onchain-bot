import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BlacklistPhrase } from 'telegram/crypto-news-publisher/domain/entities/blacklist-phrase.entity';
import { BlacklistPhraseRepository } from 'telegram/crypto-news-publisher/application/ports/blacklist-phrase.repository';
import { BlacklistPhraseEntity } from 'telegram/crypto-news-publisher/infrastructure/persistence/typeorm/entities/blacklist-phrase.entity';
import { BlacklistPhraseMapper } from 'telegram/crypto-news-publisher/infrastructure/persistence/typeorm/mappers/blacklist-phrase.mapper';

/**
 * Postgres-backed implementation of `BlacklistPhraseRepository`.
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
    const row = BlacklistPhraseMapper.toEntity(blacklistPhrase);
    await this.repo.save(row);
  }

  public async delete(id: string): Promise<void> {
    await this.repo.delete({ id });
  }
}
