import { Injectable } from '@nestjs/common';
import {
  TrackedPublishedCallRepository,
  TrackedPublishedCallRecord,
  FindTrackedCallsFilters,
} from '../../application/ports/tracked-published-call.repository';

@Injectable()
export class InMemoryTrackedPublishedCallRepository extends TrackedPublishedCallRepository {
  private readonly store = new Map<string, TrackedPublishedCallRecord>();

  async findByChainAndAddress(
    chain: string,
    address: string,
  ): Promise<TrackedPublishedCallRecord | null> {
    const key = `${chain}:${address.toLowerCase()}`;
    return this.store.get(key) ?? null;
  }

  async findActive(
    limit: number,
  ): Promise<ReadonlyArray<TrackedPublishedCallRecord>> {
    const out: TrackedPublishedCallRecord[] = [];
    for (const r of this.store.values()) {
      if (r.isActive) out.push(r);
      if (out.length >= limit) break;
    }
    return out.sort(
      (a, b) => a.publishedAt.getTime() - b.publishedAt.getTime(),
    );
  }

  async findMany(
    filters: FindTrackedCallsFilters,
  ): Promise<ReadonlyArray<TrackedPublishedCallRecord>> {
    const activeOnly = filters.activeOnly ?? true;
    const limit = filters.limit ?? 50;
    const out: TrackedPublishedCallRecord[] = [];
    for (const r of this.store.values()) {
      if (activeOnly && !r.isActive) continue;
      if (filters.hasMilestones && r.maxMilestone === null) continue;
      if (
        filters.minMilestone !== undefined &&
        (r.maxMilestone === null || r.maxMilestone < filters.minMilestone)
      ) {
        continue;
      }
      if (
        filters.maxPriceDropPercent !== undefined &&
        (r.priceDropPercent === null ||
          r.priceDropPercent > -filters.maxPriceDropPercent)
      ) {
        continue;
      }
      out.push(r);
    }
    return out
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
      .slice(0, limit);
  }

  async save(
    record: TrackedPublishedCallRecord,
  ): Promise<TrackedPublishedCallRecord> {
    const key = `${record.chain}:${record.address.toLowerCase()}`;
    this.store.set(key, { ...record });
    return { ...record, milestonesHit: [...record.milestonesHit] };
  }
}
