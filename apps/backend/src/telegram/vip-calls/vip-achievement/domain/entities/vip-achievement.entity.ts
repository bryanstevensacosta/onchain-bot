import { Entity } from 'shared/kernel/entity';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { Uuid } from 'shared/common/utils';
import type { VipAchievementRecord } from '../../application/ports/vip-achievement.repository';

/**
 * Input contract for {@link VipAchievement.create}. Mirrors {@link VipAchievementRecord}
 * with the optional `id` that `create` fills in when absent.
 */
export interface VipAchievementProps {
  readonly id?: string;
  readonly callId: string;
  readonly threshold: number;
  readonly notifiedAt: Date;
  readonly telegramMessageId?: number | null;
}

/**
 * Plain-TS domain entity for a single milestone notification recorded against
 * a published VIP call. Owned by the `vip-achievement` sub-BC.
 *
 * Lifecycle is intentionally trivial: a record is created once (atomic via the
 * unique constraint `(callId, threshold)` enforced by the persistence layer)
 * and only its `telegramMessageId` is updated afterwards. There is no state
 * machine, so this is a passive {@link Entity} rather than an `AggregateRoot`.
 *
 * IMPORTANT: This class lives in the domain layer and MUST NOT import any
 * TypeORM / NestJS / infrastructure symbols. The TypeORM `@Entity` lives at
 * `infrastructure/persistence/typeorm/entities/vip-achievement.entity.ts`.
 */
export class VipAchievement extends Entity<string> {
  public readonly callId: string;
  public readonly threshold: number;
  public readonly notifiedAt: Date;
  public readonly telegramMessageId: number | null;

  private constructor(
    id: string,
    callId: string,
    threshold: number,
    notifiedAt: Date,
    telegramMessageId: number | null,
  ) {
    super(id);
    this.callId = callId;
    this.threshold = threshold;
    this.notifiedAt = notifiedAt;
    this.telegramMessageId = telegramMessageId;
  }

  /**
   * Factory used by the application layer to build a fresh entity when the
   * handler decides to send a milestone message. `id` is auto-generated via
   * {@link Uuid.v4} when the caller does not supply one.
   */
  public static create(props: VipAchievementProps): VipAchievement {
    if (!props.callId) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'VipAchievement.create: callId is required',
      );
    }
    if (!Number.isFinite(props.threshold)) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'VipAchievement.create: threshold must be a finite number',
      );
    }
    if (!(props.notifiedAt instanceof Date) || Number.isNaN(props.notifiedAt.getTime())) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'VipAchievement.create: notifiedAt must be a valid Date',
      );
    }
    return new VipAchievement(
      props.id ?? Uuid.v4(),
      props.callId,
      props.threshold,
      props.notifiedAt,
      props.telegramMessageId ?? null,
    );
  }

  /**
   * Factory used by repositories to rebuild an entity from a persistence row.
   * The row must carry the canonical id — repositories that rehydrate rows
   * missing the id should fill it in before calling.
   */
  public static rehydrate(row: VipAchievementRecord): VipAchievement {
    if (!row.id) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'VipAchievement.rehydrate: row.id is required',
      );
    }
    return new VipAchievement(
      row.id,
      row.callId,
      row.threshold,
      row.notifiedAt,
      row.telegramMessageId ?? null,
    );
  }
}