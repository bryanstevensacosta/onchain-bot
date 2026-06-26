import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChainId } from 'chain/identity/chain-id.vo';
import { PublishedCall, PublishedCallRepository } from 'telegram/shared';
import { PublishedCallEntity } from '../entities/published-call.entity';
import { PublishedCallMapper } from '../mappers/published-call.mapper';

@Injectable()
export class TypeOrmPublishedCallRepository extends PublishedCallRepository {
  private readonly logger = new Logger(TypeOrmPublishedCallRepository.name);

  constructor(
    @InjectRepository(PublishedCallEntity)
    private readonly repo: Repository<PublishedCallEntity>,
  ) {
    super();
  }

  public async save(call: PublishedCall): Promise<void> {
    const row = PublishedCallMapper.toEntity(call);
    await this.repo.save(row);
  }

  public async findByChainAndAddress(
    chain: ChainId,
    address: string,
  ): Promise<PublishedCall | null> {
    const normalizedAddress = chain.isSolana ? address : address.toLowerCase();
    const id = `${chain.value}:${normalizedAddress}`;
    const row = await this.repo.findOne({ where: { id } });
    return row ? PublishedCallMapper.toDomain(row) : null;
  }

  public async findRecent(
    limit: number,
  ): Promise<ReadonlyArray<PublishedCall>> {
    const rows = await this.repo.find({
      order: { publishedAt: 'DESC' },
      take: limit,
    });
    return rows.map((r) => PublishedCallMapper.toDomain(r));
  }

  public async findPublished(
    limit: number,
  ): Promise<ReadonlyArray<PublishedCall>> {
    const rows = await this.repo.find({
      where: { status: 'PUBLISHED' },
      order: { publishedAt: 'DESC' },
      take: limit,
    });
    return rows.map((r) => PublishedCallMapper.toDomain(r));
  }

  public async findFailed(
    limit: number,
  ): Promise<ReadonlyArray<PublishedCall>> {
    const rows = await this.repo.find({
      where: { status: 'FAILED' },
      order: { publishedAt: 'DESC' },
      take: limit,
    });
    return rows.map((r) => PublishedCallMapper.toDomain(r));
  }

  public async countPublished(): Promise<number> {
    return this.repo.count({ where: { status: 'PUBLISHED' } });
  }
}