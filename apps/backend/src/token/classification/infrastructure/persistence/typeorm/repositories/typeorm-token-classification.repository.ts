import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChainId } from 'chain/identity/chain-id.vo';
import { TokenClassification } from 'token/classification/domain/entities/token-classification.entity';
import { TokenClassificationRepository } from 'token/classification/application/ports/token-classification.repository';
import { TokenClassificationEntity } from 'token/classification/infrastructure/persistence/typeorm/entities/token-classification.entity';
import { TokenClassificationMapper } from 'token/classification/infrastructure/persistence/typeorm/mappers/token-classification.mapper';

@Injectable()
export class TypeOrmTokenClassificationRepository extends TokenClassificationRepository {
  public constructor(
    @InjectRepository(TokenClassificationEntity)
    private readonly repo: Repository<TokenClassificationEntity>,
  ) {
    super();
  }

  public async save(classification: TokenClassification): Promise<void> {
    await this.repo.save(TokenClassificationMapper.toRow(classification));
  }

  public async findByChainAndAddress(
    chain: ChainId,
    address: string,
  ): Promise<TokenClassification | null> {
    const id = `${chain.value}:${address.toLowerCase()}`;
    const row = await this.repo.findOne({ where: { id } });
    return row ? TokenClassificationMapper.toDomain(row) : null;
  }

  public async findRecent(
    limit: number,
  ): Promise<ReadonlyArray<TokenClassification>> {
    const rows = await this.repo.find({
      order: { classifiedAt: 'DESC' },
      take: limit,
    });
    return rows.map((r) => TokenClassificationMapper.toDomain(r));
  }
}
