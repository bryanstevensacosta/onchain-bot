import { Injectable, Logger } from '@nestjs/common';
import { Uuid } from 'shared/common/utils';
import {
  VipAchievementRecord,
  VipAchievementRepository,
} from '../../application/ports/vip-achievement.repository';

/**
 * In-memory implementation of {@link VipAchievementRepository}.
 *
 * Selected when `DATABASE_ENABLED=false` (tests, lightweight dev runs).
 * Storage is a `Map<callId, VipAchievementRecord[]>` so the per-call scans
 * done by `findByCall`, `findThresholdsForCall`, `countByCall` are O(n)
 * over the bucket rather than a full-table scan.
 *
 * The same atomic-dedup contract as the TypeORM adapter holds here:
 * {@link save} returns `null` when `(callId, threshold)` is already present,
 * giving the caller the same "already notified — skip" semantic across
 * both persistence backends.
 */
@Injectable()
export class InMemoryVipAchievementRepository extends VipAchievementRepository {
  private readonly logger = new Logger(
    InMemoryVipAchievementRepository.name,
  );
  private readonly store = new Map<string, VipAchievementRecord[]>();

  public async findByCall(
    callId: string,
  ): Promise<VipAchievementRecord[]> {
    return [...(this.store.get(callId) ?? [])];
  }

  public async findThresholdsForCall(
    callId: string,
  ): Promise<number[]> {
    return (this.store.get(callId) ?? []).map((r) => r.threshold);
  }

  public async existsByCallAndThreshold(
    callId: string,
    threshold: number,
  ): Promise<boolean> {
    const bucket = this.store.get(callId);
    if (!bucket) {
      return false;
    }
    return bucket.some((r) => r.threshold === threshold);
  }

  /**
   * Equivalent of the Postgres unique-constraint race-free INSERT: we
   * pre-check the bucket for `(callId, threshold)` and return `null` if
   * found. JS is single-threaded so we don't need a lock here, but the
   * returned `null` keeps the contract identical to the TypeORM adapter.
   */
  public async save(
    record: VipAchievementRecord,
  ): Promise<VipAchievementRecord | null> {
    if (await this.existsByCallAndThreshold(record.callId, record.threshold)) {
      return null;
    }
    const saved: VipAchievementRecord = {
      id: record.id ?? Uuid.v4(),
      callId: record.callId,
      threshold: record.threshold,
      notifiedAt: record.notifiedAt,
      telegramMessageId: record.telegramMessageId ?? null,
    };
    const bucket = this.store.get(record.callId) ?? [];
    bucket.push(saved);
    this.store.set(record.callId, bucket);
    return saved;
  }

  public async countByCall(callId: string): Promise<number> {
    return this.store.get(callId)?.length ?? 0;
  }

  public async updateTelegramMessageId(
    callId: string,
    threshold: number,
    messageId: number,
  ): Promise<void> {
    const bucket = this.store.get(callId);
    const record = bucket?.find((r) => r.threshold === threshold);
    if (!record) {
      this.logger.warn(
        `Cannot update telegramMessageId: record not found for callId=${callId} threshold=${threshold}`,
      );
      return;
    }
    record.telegramMessageId = messageId;
  }
}