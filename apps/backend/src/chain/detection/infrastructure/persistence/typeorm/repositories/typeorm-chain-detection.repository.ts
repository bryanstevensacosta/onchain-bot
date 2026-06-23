import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChainDetectionResult } from 'chain/detection/domain/entities/chain-detection-result.entity';
import { ChainDetectionRepository } from 'chain/detection/application/ports/chain-detection.repository';
import { ChainDetectionResultEntity } from 'chain/detection/infrastructure/persistence/typeorm/entities/chain-detection-result.entity';
import { ChainDetectionResultMapper } from 'chain/detection/infrastructure/persistence/typeorm/mappers/chain-detection-result.mapper';

@Injectable()
export class TypeOrmChainDetectionRepository extends ChainDetectionRepository {
  public constructor(
    @InjectRepository(ChainDetectionResultEntity)
    private readonly repo: Repository<ChainDetectionResultEntity>,
  ) {
    super();
  }

  public async save(result: ChainDetectionResult): Promise<void> {
    await this.repo.save(ChainDetectionResultMapper.toRow(result));
  }

  public async findByAddress(
    address: string,
  ): Promise<ChainDetectionResult | null> {
    const id = address.toLowerCase();
    const row = await this.repo.findOne({ where: { id } });
    return row ? ChainDetectionResultMapper.toDomain(row) : null;
  }

  public async findRecent(
    limit: number,
  ): Promise<ReadonlyArray<ChainDetectionResult>> {
    const rows = await this.repo.find({
      order: { detectedAt: 'DESC' },
      take: limit,
    });
    return rows.map((r) => ChainDetectionResultMapper.toDomain(r));
  }
}
