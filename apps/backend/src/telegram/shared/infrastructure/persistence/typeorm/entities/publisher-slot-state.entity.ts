import {
  Check,
  Column,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { SlotScope } from 'telegram/shared/domain/ports/slot-arbitrator.port';

/**
 * TypeORM persistence shape for the shared publish-slot state.
 *
 * Table: `crypto_news_publisher_slot_state` — singleton row (always
 * `id = 1`) recording the most-recent publish (`last_scope`,
 * `last_publish_at`) and the minimum gap (`min_seconds_between_slots`)
 * enforced between any two publishes on the shared channel. Persisted
 * so a backend restart does not lose the last-publish anchor and let
 * news + ads collide right after boot.
 */
@Entity({ name: 'crypto_news_publisher_slot_state' })
@Check('ck_slot_state_last_scope', `last_scope IN ('news', 'ads')`)
export class PublisherSlotStateEntity {
  /** Always 1 (singleton). */
  @PrimaryColumn({ name: 'id', type: 'integer' })
  public id!: number;

  @Column({
    name: 'last_scope',
    type: 'varchar',
    length: 16,
    nullable: true,
  })
  public lastScope!: SlotScope | null;

  @Column({ name: 'last_publish_at', type: 'timestamptz', nullable: true })
  public lastPublishAt!: Date | null;

  @Column({ name: 'min_seconds_between_slots', type: 'integer', default: 60 })
  public minSecondsBetweenSlots!: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  public updatedAt!: Date;
}
