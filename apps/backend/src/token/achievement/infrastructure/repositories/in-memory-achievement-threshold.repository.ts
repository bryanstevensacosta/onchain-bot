import { Injectable } from '@nestjs/common';
import {
  AchievementThresholdRepository,
  AchievementThresholdRecord,
} from '../../application/ports/achievement-threshold.repository';

@Injectable()
export class InMemoryAchievementThresholdRepository extends AchievementThresholdRepository {
  private nextId = 1;
  private store: Map<number, AchievementThresholdRecord> = new Map();

  async findEnabled(): Promise<AchievementThresholdRecord[]> {
    return [...this.store.values()];
  }

  async findAll(): Promise<AchievementThresholdRecord[]> {
    return [...this.store.values()];
  }

  async findByMultiple(
    multiple: number,
  ): Promise<AchievementThresholdRecord | null> {
    for (const r of this.store.values()) {
      if (r.multiple === multiple) return r;
    }
    return null;
  }

  async save(
    threshold: AchievementThresholdRecord,
  ): Promise<AchievementThresholdRecord> {
    const id = this.nextId++;
    const saved = { id, multiple: threshold.multiple };
    this.store.set(id, saved);
    return saved;
  }

  async replaceAll(
    thresholds: ReadonlyArray<AchievementThresholdRecord>,
  ): Promise<void> {
    this.store.clear();
    this.nextId = 1;
    for (const t of thresholds) {
      await this.save(t);
    }
  }

  async count(): Promise<number> {
    return this.store.size;
  }
}
