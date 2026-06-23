import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChainId } from 'chain/identity/chain-id.vo';
import { TokenSnapshot } from '../../../../domain/entities/token-snapshot.entity';
import { TokenSnapshotRepository } from '../../../../application/ports/token-snapshot.repository';
import { TokenSnapshotEntity } from '../entities/token-snapshot.entity';
import { TokenSnapshotMapper } from '../mappers/token-snapshot.mapper';

@Injectable()
export class TypeOrmTokenSnapshotRepository extends TokenSnapshotRepository {
  public constructor(
    @InjectRepository(TokenSnapshotEntity)
    private readonly repo: Repository<TokenSnapshotEntity>,
  ) {
    super();
  }

  public async save(snapshot: TokenSnapshot): Promise<void> {
    await this.repo.save(TokenSnapshotMapper.toRow(snapshot));
  }

  public async findByChainAndAddress(
    chain: ChainId,
    address: string,
  ): Promise<TokenSnapshot | null> {
    const id = `${chain.value}:${address.toLowerCase()}`;
    const row = await this.repo.findOne({ where: { id } });
    return row ? TokenSnapshotMapper.toDomain(row) : null;
  }

  public async findRecent(
    limit: number,
  ): Promise<ReadonlyArray<TokenSnapshot>> {
    const rows = await this.repo.find({
      order: { enrichedAt: 'DESC' },
      take: limit,
    });
    return rows.map((r) => TokenSnapshotMapper.toDomain(r));
  }
}
