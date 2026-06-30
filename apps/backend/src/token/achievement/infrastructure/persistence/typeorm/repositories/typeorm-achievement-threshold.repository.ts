import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AchievementThresholdRepository,
  AchievementThresholdRecord,
} from '../../../../application/ports/achievement-threshold.repository';
import { AchievementThresholdEntity } from '../../../../domain/entities/achievement-threshold.entity';

@Injectable()
export class TypeormAchievementThresholdRepository extends AchievementThresholdRepository {
  constructor(
    @InjectRepository(AchievementThresholdEntity)
    private readonly repo: Repository<AchievementThresholdEntity>,
  ) {
    super();
  }

  async findEnabled(): Promise<AchievementThresholdRecord[]> {
    const rows = await this.repo.find();
    return rows.map((r) => ({ id: r.id, multiple: r.multiple }));
  }

  async findAll(): Promise<AchievementThresholdRecord[]> {
    return this.findEnabled();
  }

  async findByMultiple(
    multiple: number,
  ): Promise<AchievementThresholdRecord | null> {
    const row = await this.repo.findOne({ where: { multiple } });
    return row ? { id: row.id, multiple: row.multiple } : null;
  }

  async save(
    threshold: AchievementThresholdRecord,
  ): Promise<AchievementThresholdRecord> {
    const entity = this.repo.create({ multiple: threshold.multiple });
    const saved = await this.repo.save(entity);
    return { id: saved.id, multiple: saved.multiple };
  }

  async replaceAll(
    thresholds: ReadonlyArray<AchievementThresholdRecord>,
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
