import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { CallEvaluationJob } from 'token/call-tracking/domain/entities/call-evaluation-job.entity';
import { CallEvaluationJobRepository } from 'token/call-tracking/application/ports/call-evaluation-job.repository';
import { CallEvaluationJobEntity } from 'token/call-tracking/infrastructure/persistence/typeorm/entities/call-evaluation-job.entity';
import { CallEvaluationJobMapper } from 'token/call-tracking/infrastructure/persistence/typeorm/mappers/call-evaluation-job.mapper';

@Injectable()
export class TypeOrmCallEvaluationJobRepository extends CallEvaluationJobRepository {
  public constructor(
    @InjectRepository(CallEvaluationJobEntity)
    private readonly repo: Repository<CallEvaluationJobEntity>,
  ) {
    super();
  }

  public async save(job: CallEvaluationJob): Promise<void> {
    await this.repo.save(CallEvaluationJobMapper.toRow(job));
  }

  public async findById(id: string): Promise<CallEvaluationJob | null> {
    const row = await this.repo.findOne({ where: { id } });
    return row ? CallEvaluationJobMapper.toDomain(row) : null;
  }

  public async findDue(
    now: Date,
    limit: number,
  ): Promise<ReadonlyArray<CallEvaluationJob>> {
    const rows = await this.repo.find({
      where: { status: 'PENDING', scheduledAt: LessThanOrEqual(now) },
      order: { scheduledAt: 'ASC' },
      take: limit,
    });
    return rows.map((r) => CallEvaluationJobMapper.toDomain(r));
  }

  public async findPendingForCall(
    kolId: string,
    chain: string,
    address: string,
    callTimestamp: Date,
  ): Promise<ReadonlyArray<CallEvaluationJob>> {
    const rows = await this.repo.find({
      where: {
        kolId,
        chain,
        address,
        status: 'PENDING',
        callTimestamp,
      },
    });
    return rows.map((r) => CallEvaluationJobMapper.toDomain(r));
  }

  public async count(): Promise<number> {
    return this.repo.count();
  }
}
