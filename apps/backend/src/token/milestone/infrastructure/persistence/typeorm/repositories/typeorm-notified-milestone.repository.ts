import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  NotifiedMilestoneRepository,
  NotifiedMilestoneRecord,
} from '../../../../application/ports/notified-milestone.repository';
import { NotifiedMilestoneEntity } from '../../../../domain/entities/notified-milestone.entity';

@Injectable()
export class TypeormNotifiedMilestoneRepository extends NotifiedMilestoneRepository {
  constructor(
    @InjectRepository(NotifiedMilestoneEntity)
    private readonly repo: Repository<NotifiedMilestoneEntity>,
  ) {
    super();
  }

  async findByCall(callId: string): Promise<NotifiedMilestoneRecord[]> {
    const rows = await this.repo.find({ where: { callId } });
    return rows.map((r) => this.toRecord(r));
  }

  async findThresholdsForCall(callId: string): Promise<number[]> {
    const rows = await this.repo.find({
      where: { callId },
      select: ['threshold'],
    });
    return rows.map((r) => r.threshold);
  }

  async existsByCallAndThreshold(
    callId: string,
    threshold: number,
  ): Promise<boolean> {
    const count = await this.repo.count({ where: { callId, threshold } });
    return count > 0;
  }

  async save(
    notified: NotifiedMilestoneRecord,
  ): Promise<NotifiedMilestoneRecord> {
    const entity = this.repo.create({
      callId: notified.callId,
      threshold: notified.threshold,
      notifiedAt: notified.notifiedAt,
    });
    const saved = await this.repo.save(entity);
    return this.toRecord(saved);
  }

  async countByCall(callId: string): Promise<number> {
    return this.repo.count({ where: { callId } });
  }

  private toRecord(row: NotifiedMilestoneEntity): NotifiedMilestoneRecord {
    return {
      id: row.id,
      callId: row.callId,
      threshold: row.threshold,
      notifiedAt: row.notifiedAt,
    };
  }
}
