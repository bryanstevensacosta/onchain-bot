import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  SlotArbitratorPort,
  type SlotDecision,
  type SlotScope,
} from 'telegram/shared/domain/ports/slot-arbitrator.port';
import { PublisherSlotStateEntity } from 'telegram/shared/infrastructure/persistence/typeorm/entities/publisher-slot-state.entity';

const DEFAULT_MIN_SECONDS_BETWEEN_SLOTS = 60;

/**
 * Postgres-backed implementation of `SlotArbitratorPort`.
 *
 * Backs a singleton row (`id=1`). `canPublishNow` allows a publish
 * when there is no prior publish or when `now - lastPublishAt` has
 * elapsed `min_seconds_between_slots`. `recordPublish` upserts the row
 * with the latest scope + timestamp.
 *
 * The `unknown-scope` reason is reserved for the port contract and is
 * never produced by this implementation.
 */
@Injectable()
export class TypeOrmSlotArbitrator extends SlotArbitratorPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    super();
  }

  public async canPublishNow(
    scope: SlotScope,
    now: Date,
  ): Promise<SlotDecision> {
    const repo = this.dataSource.getRepository(PublisherSlotStateEntity);
    const row = await repo.findOne({ where: { id: 1 } });
    if (row === null || row.lastPublishAt === null) {
      return {
        canPublish: true,
        nextSlotAvailableAt: null,
        remainingSeconds: 0,
        lastScope: row?.lastScope ?? null,
        reason: 'ok',
      };
    }
    const minMs =
      (row.minSecondsBetweenSlots ?? DEFAULT_MIN_SECONDS_BETWEEN_SLOTS) * 1000;
    const elapsedMs = now.getTime() - row.lastPublishAt.getTime();
    if (elapsedMs >= minMs) {
      return {
        canPublish: true,
        nextSlotAvailableAt: null,
        remainingSeconds: 0,
        lastScope: row.lastScope,
        reason: 'ok',
      };
    }
    return {
      canPublish: false,
      nextSlotAvailableAt: new Date(row.lastPublishAt.getTime() + minMs),
      remainingSeconds: Math.ceil((minMs - elapsedMs) / 1000),
      lastScope: row.lastScope,
      reason: 'min-gap-not-met',
    };
  }

  public async recordPublish(scope: SlotScope, at: Date): Promise<void> {
    const repo = this.dataSource.getRepository(PublisherSlotStateEntity);
    await repo.save({
      id: 1,
      lastScope: scope,
      lastPublishAt: at,
      minSecondsBetweenSlots: DEFAULT_MIN_SECONDS_BETWEEN_SLOTS,
      updatedAt: new Date(),
    });
  }
}
