import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  TrackedPublishedCallRepository,
  TrackedPublishedCallRecord,
  FindTrackedCallsFilters,
} from 'token/call-tracking/application/ports/tracked-published-call.repository';
import { TrackedPublishedCallOrmEntity } from '../entities/tracked-published-call.entity';
import { TrackedPublishedCallMapper } from '../mappers/tracked-published-call.mapper';

@Injectable()
export class TypeOrmTrackedPublishedCallRepository extends TrackedPublishedCallRepository {
  constructor(
    @InjectRepository(TrackedPublishedCallOrmEntity)
    private readonly repo: Repository<TrackedPublishedCallOrmEntity>,
  ) {
    super();
  }

  async findByChainAndAddress(
    chain: string,
    address: string,
  ): Promise<TrackedPublishedCallRecord | null> {
    const normalizedAddress =
      chain === 'solana' ? address : address.toLowerCase();
    const row = await this.repo.findOne({
      where: { chain, address: normalizedAddress },
    });
    return row ? TrackedPublishedCallMapper.toRecord(row) : null;
  }

  async findActive(
    limit: number,
  ): Promise<ReadonlyArray<TrackedPublishedCallRecord>> {
    const rows = await this.repo.find({
      where: { isActive: true },
      take: limit,
      order: { publishedAt: 'ASC' },
    });
    return rows.map((r) => TrackedPublishedCallMapper.toRecord(r));
  }

  async findMany(
    filters: FindTrackedCallsFilters,
  ): Promise<ReadonlyArray<TrackedPublishedCallRecord>> {
    const qb = this.repo.createQueryBuilder('t');
    if (filters.activeOnly ?? true) {
      qb.andWhere('t.isActive = :active', { active: true });
    }
    if (filters.hasMilestones) {
      qb.andWhere('t.maxMilestone IS NOT NULL');
    }
    if (filters.minMilestone !== undefined) {
      qb.andWhere('t.maxMilestone >= :minM', { minM: filters.minMilestone });
    }
    if (filters.maxPriceDropPercent !== undefined) {
      qb.andWhere('t.priceDropPercent IS NOT NULL');
      qb.andWhere('t.priceDropPercent <= :maxDrop', {
        maxDrop: -filters.maxPriceDropPercent,
      });
    }
    qb.orderBy('t.publishedAt', 'DESC').take(filters.limit ?? 50);
    const rows = await qb.getMany();
    return rows.map((r) => TrackedPublishedCallMapper.toRecord(r));
  }

  async save(
    record: TrackedPublishedCallRecord,
  ): Promise<TrackedPublishedCallRecord> {
    const existing = await this.repo.findOne({
      where: { chain: record.chain, address: record.address },
    });
    if (existing) {
      existing.kolId = record.kolId;
      existing.ticker = record.ticker;
      existing.mcAtPublish = record.mcAtPublish;
      existing.mcNow = record.mcNow;
      existing.milestonesHit = [...record.milestonesHit];
      existing.maxMilestone = record.maxMilestone;
      existing.priceDropPercent = record.priceDropPercent;
      existing.lastUpdatedAt = record.lastUpdatedAt;
      existing.isActive = record.isActive;
      const saved = await this.repo.save(existing);
      return TrackedPublishedCallMapper.toRecord(saved);
    }
    const entity = TrackedPublishedCallMapper.fromRecord(record);
    const saved = await this.repo.save(entity);
    return TrackedPublishedCallMapper.toRecord(saved);
  }

  async countActive(): Promise<number> {
    return this.repo.count({ where: { isActive: true } });
  }

  async deactivateById(id: string): Promise<void> {
    await this.repo.update(
      { id },
      { isActive: false, lastUpdatedAt: new Date() },
    );
  }
}
