import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  MilestoneThresholdRepository,
  MilestoneThresholdRecord,
} from '../../../../application/ports/milestone-threshold.repository';
import { MilestoneThresholdEntity } from '../../../../domain/entities/milestone-threshold.entity';

@Injectable()
export class TypeormMilestoneThresholdRepository extends MilestoneThresholdRepository {
  constructor(
    @InjectRepository(MilestoneThresholdEntity)
    private readonly repo: Repository<MilestoneThresholdEntity>,
  ) {
    super();
  }

  async findEnabled(): Promise<MilestoneThresholdRecord[]> {
    const rows = await this.repo.find();
    return rows.map((r) => ({ id: r.id, multiple: r.multiple }));
  }

  async findAll(): Promise<MilestoneThresholdRecord[]> {
    return this.findEnabled();
  }

  async findByMultiple(
    multiple: number,
  ): Promise<MilestoneThresholdRecord | null> {
    const row = await this.repo.findOne({ where: { multiple } });
    return row ? { id: row.id, multiple: row.multiple } : null;
  }

  async save(
    threshold: MilestoneThresholdRecord,
  ): Promise<MilestoneThresholdRecord> {
    const entity = this.repo.create({ multiple: threshold.multiple });
    const saved = await this.repo.save(entity);
    return { id: saved.id, multiple: saved.multiple };
  }

  async replaceAll(
    thresholds: ReadonlyArray<MilestoneThresholdRecord>,
  ): Promise<void> {
    await this.repo.clear();
    if (thresholds.length === 0) return;
    const entities = thresholds.map((t) =>
      this.repo.create({ multiple: t.multiple }),
    );
    await this.repo.save(entities);
  }

  async count(): Promise<number> {
    return this.repo.count();
  }
}
