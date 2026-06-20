import {
  Column,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * TypeORM persistence shape for `TelegramChannel`.
 *
 * Keyed by `channelId` (Telegram peer id as string). One row per channel.
 *
 * NOTE: this is NOT the domain aggregate. The domain entity lives at
 * `ca/ingestion/telegram/domain/entities/telegram-channel.entity.ts` and
 * owns invariants + domain events. The mapper below translates between
 * the two so the domain stays pure.
 *
 * PG-specific column types (`timestamptz`) — these entities only target
 * Postgres in production. For test isolation, prefer real PG via docker
 * or dedicated PG containers.
 */
@Entity({ name: 'telegram_channels' })
@Index('idx_telegram_channels_username', ['username'], {
  where: '"username" IS NOT NULL',
})
export class TelegramChannelEntity {
  @PrimaryColumn({ name: 'channel_id', type: 'varchar', length: 64 })
  public channelId!: string;

  @Column({ name: 'username', type: 'varchar', length: 64, nullable: true })
  public username!: string | null;

  @Column({ name: 'title', type: 'varchar', length: 256 })
  public title!: string;

  @Column({ name: 'is_active', type: 'boolean', default: false })
  public isActive!: boolean;

  @Column({ name: 'last_ingested_at', type: 'timestamptz', nullable: true })
  public lastIngestedAt!: Date | null;

  @Column({ name: 'added_at', type: 'timestamptz' })
  public addedAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  public updatedAt!: Date;
}
