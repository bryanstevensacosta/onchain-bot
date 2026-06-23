import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CallPerformance } from 'token/call-tracking/domain/value-objects/call-performance.vo';
import { CallPerformanceRepository } from 'token/call-tracking/application/ports/call-performance.repository';
import { CallPerformanceEntity } from 'token/call-tracking/infrastructure/persistence/typeorm/entities/call-performance.entity';
import { CallPerformanceMapper } from 'token/call-tracking/infrastructure/persistence/typeorm/mappers/call-performance.mapper';

@Injectable()
export class TypeOrmCallPerformanceRepository extends CallPerformanceRepository {
  public constructor(
    @InjectRepository(CallPerformanceEntity)
    private readonly repo: Repository<CallPerformanceEntity>,
  ) {
    super();
  }

  public async save(perf: CallPerformance): Promise<void> {
    await this.repo.save(CallPerformanceMapper.toRow(perf));
  }

  public async findByChannel(
    kolId: string,
  ): Promise<ReadonlyArray<CallPerformance>> {
    const rows = await this.repo.find({ where: { kolId } });
    return rows.map((r) => CallPerformanceMapper.toDomain(r));
  }

  public async findByToken(
    tokenId: string,
  ): Promise<ReadonlyArray<CallPerformance>> {
    const rows = await this.repo.find({ where: { tokenId } });
    return rows.map((r) => CallPerformanceMapper.toDomain(r));
  }

  public async findAll(): Promise<ReadonlyArray<CallPerformance>> {
    const rows = await this.repo.find();
    return rows.map((r) => CallPerformanceMapper.toDomain(r));
  }
}
