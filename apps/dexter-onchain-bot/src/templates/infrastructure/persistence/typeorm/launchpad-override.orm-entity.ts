import { Column, Entity, PrimaryColumn, Unique } from 'typeorm';

/**
 * TypeORM persistence shape for the curated mint→launchpad override
 * table (dexter plan todo 37).
 *
 * Table-driven origin curation for the scan pipeline: one row pins a
 * normalized `mint` to a detector slug `launchpad_id`. Registered in
 * `DEXTER_PERSISTED_ENTITIES` (single registration point) so both the
 * runtime `DatabaseModule` and the CLI `data-source.ts` pick it up.
 * `mint` is stored normalized (EVM lowercase, Solana exact — see
 * `normalizeMint`), so the unique constraint naturally rejects
 * case-variant EVM duplicates. `note` is operator prose (nullable).
 *
 * Column names are spec-literal (`launchpad_id`, `created_at`); the
 * table carries the repo `dexter_` prefix like `dexter_display_maps`.
 */
@Entity('dexter_launchpad_overrides')
@Unique('uq_dexter_launchpad_overrides_mint', ['mint'])
export class LaunchpadOverrideOrmEntity {
  @PrimaryColumn({ type: 'uuid' })
  public id!: string;

  @Column({ type: 'varchar', length: 64 })
  public mint!: string;

  @Column({ type: 'varchar', length: 40, name: 'launchpad_id' })
  public launchpadId!: string;

  @Column({ type: 'varchar', length: 280, nullable: true })
  public note!: string | null;

  @Column({
    type: 'timestamptz',
    name: 'created_at',
    default: () => 'CURRENT_TIMESTAMP',
  })
  public createdAt!: Date;
}
