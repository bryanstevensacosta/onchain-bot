import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Keyword } from '../../../../domain/keyword.entity';
import { KeywordRepository } from '../../../../application/ports/keyword.repository';
import { KeywordEntity } from '../entities/keyword.entity';
import { KeywordMapper } from '../mappers/keyword.mapper';

/**
 * Postgres-backed `KeywordRepository` (unwired until GAP-1 persistence todo).
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
    await this.repo.save(KeywordMapper.toEntity(keyword));
  }

  public async delete(id: string): Promise<void> {
    await this.repo.delete({ id });
  }
}
