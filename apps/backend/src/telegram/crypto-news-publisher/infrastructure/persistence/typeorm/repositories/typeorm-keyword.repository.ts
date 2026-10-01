/**
 * @deprecated Moved to apps/feed-publisher/src/queue/ + apps/feed-publisher/src/llm/ + apps/feed-publisher/src/keywords/ (Tramo 2, todos 3+4+5 + P18 companion).
 * Backend legacy copy; stays wired for dual-run and is removed at cutover (todo 11).
 * Do not extend — add queue/llm/keywords logic in apps/feed-publisher/src/{queue,llm,keywords}/ instead.
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Keyword } from 'telegram/crypto-news-publisher/domain/entities/keyword.entity';
import { KeywordRepository } from 'telegram/crypto-news-publisher/application/ports/keyword.repository';
import { KeywordEntity } from 'telegram/crypto-news-publisher/infrastructure/persistence/typeorm/entities/keyword.entity';
import { KeywordMapper } from 'telegram/crypto-news-publisher/infrastructure/persistence/typeorm/mappers/keyword.mapper';

/**
 * Postgres-backed implementation of `KeywordRepository`.
 */
@Injectable()
export class TypeOrmKeywordRepository extends KeywordRepository {
  constructor(
    @InjectRepository(KeywordEntity)
    private readonly repo: Repository<KeywordEntity>,
  ) {
    super();
  }

  public async findAll(): Promise<ReadonlyArray<Keyword>> {
    const rows = await this.repo.find({ order: { createdAt: 'ASC' } });
    return rows.map((r) => KeywordMapper.toDomain(r));
  }

  public async findEnabled(): Promise<ReadonlyArray<Keyword>> {
    const rows = await this.repo.find({
      where: { enabled: true },
      order: { createdAt: 'ASC' },
    });
    return rows.map((r) => KeywordMapper.toDomain(r));
  }

  public async save(keyword: Keyword): Promise<void> {
    const row = KeywordMapper.toEntity(keyword);
    await this.repo.save(row);
  }

  public async delete(id: string): Promise<void> {
    await this.repo.delete({ id });
  }
}
