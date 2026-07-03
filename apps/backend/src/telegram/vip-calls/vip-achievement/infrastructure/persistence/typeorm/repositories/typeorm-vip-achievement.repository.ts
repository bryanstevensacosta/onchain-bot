import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import {
  VipAchievementRecord,
  VipAchievementRepository,
} from '../../../../application/ports/vip-achievement.repository';
import { VipAchievementEntity } from '../entities/vip-achievement.entity';

/**
 * Postgres-side implementation of {@link VipAchievementRepository}.
 *
 * Selected when `isDatabaseEnabled()` returns true. The race-free dedup
 * guarantee relies on the unique index `uq_vip_notified_achievements_call_threshold`
 * declared on {@link VipAchievementEntity}: a duplicate INSERT throws a
 * Postgres `23505` unique violation that we translate into a `null` return
 * from {@link save}, so the caller can skip the side effects (Telegram send
 * + downstream side work).
 */
@Injectable()
export class TypeormVipAchievementRepository extends VipAchievementRepository {
  private readonly logger = new Logger(
    TypeormVipAchievementRepository.name,
  );

  constructor(
    @InjectRepository(VipAchievementEntity)
    private readonly repo: Repository<VipAchievementEntity>,
  ) {
    super();
  }

  public async findByCall(
    callId: string,
  ): Promise<VipAchievementRecord[]> {
    const rows = await this.repo.find({ where: { callId } });
    return rows.map((r) => this.toRecord(r));
  }

  public async findThresholdsForCall(
    callId: string,
  ): Promise<number[]> {
    const rows = await this.repo.find({
      where: { callId },
      select: ['threshold'],
    });
    return rows.map((r) => r.threshold);
  }

  public async existsByCallAndThreshold(
    callId: string,
    threshold: number,
  ): Promise<boolean> {
    const count = await this.repo.count({ where: { callId, threshold } });
    return count > 0;
  }

  /**
   * Atomically persist the milestone notification.
   *
   * On unique constraint violation (Postgres code `23505`) we return `null`
   * — the caller (the event handler) treats this as "already notified by a
   * concurrent invocation" and skips the Telegram send. This is the
   * authoritative dedup mechanism for the milestone flow; we deliberately
   * do NOT rely on a read-then-write `existsByCallAndThreshold + save` pair,
   * which is racy across async workers and across the in-memory ↔ DB switch.
   */
  public async save(
    record: VipAchievementRecord,
  ): Promise<VipAchievementRecord | null> {
    const entity = this.repo.create({
      callId: record.callId,
      threshold: record.threshold,
      notifiedAt: record.notifiedAt,
      telegramMessageId: record.telegramMessageId ?? null,
    });
    try {
      const saved = await this.repo.save(entity);
      return this.toRecord(saved);
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        return null;
      }
      throw err;
    }
  }

  public async countByCall(callId: string): Promise<number> {
    return this.repo.count({ where: { callId } });
  }

  public async updateTelegramMessageId(
    callId: string,
    threshold: number,
    messageId: number,
  ): Promise<void> {
    const result = await this.repo.update(
      { callId, threshold },
      { telegramMessageId: messageId },
    );
    if (result.affected === 0) {
      this.logger.warn(
        `Cannot update telegramMessageId: record not found for callId=${callId} threshold=${threshold}`,
      );
    }
  }

  /**
   * Detect Postgres unique constraint violation. We accept both the wrapped
   * {@link QueryFailedError} (driver code on `driverError`) and any error
   * that already exposes a `code` field directly, so unit tests that throw
   * a plain `{ code: '23505' }` object continue to work.
   */
  private isUniqueViolation(err: unknown): boolean {
    if (err instanceof QueryFailedError) {
      const driverError = err as QueryFailedError & {
        driverError?: { code?: string };
      };
      return driverError.driverError?.code === '23505';
    }
    if (typeof err === 'object' && err !== null && 'code' in err) {
      return (err as { code?: string }).code === '23505';
    }
    return false;
  }

  private toRecord(row: VipAchievementEntity): VipAchievementRecord {
    return {
      id: row.id,
      callId: row.callId,
      threshold: row.threshold,
      notifiedAt: row.notifiedAt,
      telegramMessageId: row.telegramMessageId,
    };
  }
}