import {
  Column,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { KolLifecycleStatus } from 'kol/identity/domain/entities/kol.entity';

/**
 * TypeORM persistence shape for `Kol`.
 *
 * Keyed by `kolId` (Telegram peer id as string). One row per KOL.
 *
 * NOTE: this is NOT the domain aggregate. The domain entity lives at
 * `kol/identity/domain/entities/kol.entity.ts` and owns
 * invariants + domain events. The mapper below translates between
 * the two so the domain stays pure.
 *
 * PG-specific column types (`timestamptz`) — these entities only target
 * Postgres in production.
 */
@Entity({ name: 'kols' })
@Index('idx_kols_handle', ['handle'], {
  where: '"handle" IS NOT NULL',
})
@Index('idx_kols_lifecycle_status', ['lifecycleStatus'])
export class KolEntity {
  @PrimaryColumn({ name: 'kol_id', type: 'varchar', length: 64 })
  public kolId!: string;

  @Column({ name: 'handle', type: 'varchar', length: 64, nullable: true })
  public handle!: string | null;

  @Column({ name: 'title', type: 'varchar', length: 256 })
  public title!: string;

  @Column({ name: 'is_active', type: 'boolean', default: false })
  public isActive!: boolean;

  @Column({
    name: 'lifecycle_status',
    type: 'varchar',
    length: 16,
    default: 'ACTIVE',
  })
  public lifecycleStatus!: KolLifecycleStatus;

  @Column({ name: 'last_ingested_at', type: 'timestamptz', nullable: true })
  public lastIngestedAt!: Date | null;

  @Column({ name: 'added_at', type: 'timestamptz' })
  public addedAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  public updatedAt!: Date;
}
