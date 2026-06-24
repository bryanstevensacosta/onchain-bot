import { Injectable } from '@nestjs/common';
import {
  MilestoneThresholdRepository,
  MilestoneThresholdRecord,
} from '../../application/ports/milestone-threshold.repository';

@Injectable()
export class InMemoryMilestoneThresholdRepository extends MilestoneThresholdRepository {
  private nextId = 1;
  private store: Map<number, MilestoneThresholdRecord> = new Map();

  async findEnabled(): Promise<MilestoneThresholdRecord[]> {
    return [...this.store.values()];
  }

  async findAll(): Promise<MilestoneThresholdRecord[]> {
    return [...this.store.values()];
  }

  async findByMultiple(
    multiple: number,
  ): Promise<MilestoneThresholdRecord | null> {
    for (const r of this.store.values()) {
      if (r.multiple === multiple) return r;
    }
    return null;
  }

  async save(
    threshold: MilestoneThresholdRecord,
  ): Promise<MilestoneThresholdRecord> {
    const id = this.nextId++;
    const saved = { id, multiple: threshold.multiple };
    this.store.set(id, saved);
    return saved;
  }

  async replaceAll(
    thresholds: ReadonlyArray<MilestoneThresholdRecord>,
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
