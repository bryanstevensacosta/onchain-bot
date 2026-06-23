import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChainId } from 'chain/identity/chain-id.vo';
import { HoneypotAnalysis } from 'token/honeypot/domain/entities/honeypot-analysis.entity';
import { HoneypotAnalysisRepository } from 'token/honeypot/application/ports/honeypot-analysis.repository';
import { HoneypotAnalysisEntity } from 'token/honeypot/infrastructure/persistence/typeorm/entities/honeypot-analysis.entity';
import { HoneypotAnalysisMapper } from 'token/honeypot/infrastructure/persistence/typeorm/mappers/honeypot-analysis.mapper';

@Injectable()
export class TypeOrmHoneypotAnalysisRepository extends HoneypotAnalysisRepository {
  public constructor(
    @InjectRepository(HoneypotAnalysisEntity)
    private readonly repo: Repository<HoneypotAnalysisEntity>,
  ) {
    super();
  }

  public async save(analysis: HoneypotAnalysis): Promise<void> {
    await this.repo.save(HoneypotAnalysisMapper.toRow(analysis));
  }

  public async findByChainAndAddress(
    chain: ChainId,
    address: string,
  ): Promise<HoneypotAnalysis | null> {
    const id = `${chain.value}:${address.toLowerCase()}`;
    const row = await this.repo.findOne({ where: { id } });
    return row ? HoneypotAnalysisMapper.toDomain(row) : null;
  }

  public async findRecent(
    limit: number,
  ): Promise<ReadonlyArray<HoneypotAnalysis>> {
    const rows = await this.repo.find({
      order: { analyzedAt: 'DESC' },
      take: limit,
    });
    return rows.map((r) => HoneypotAnalysisMapper.toDomain(r));
  }
}
